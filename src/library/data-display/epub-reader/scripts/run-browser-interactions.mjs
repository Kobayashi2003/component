import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserVersion, discoverChromium } from './chromium-runtime.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = resolve(packageRoot, '../../../..');
const reportDirectory = join(packageRoot, '.test-results', 'browser');
const reportPath = join(reportDirectory, 'interactions.json');
const profile = mkdtempSync(join(tmpdir(), 'epub-reader-browser-interactions-'));
mkdirSync(reportDirectory, { recursive: true });

let report = { status: 'not-run', reason: 'unknown' };
let server = null;
let browserProcess = null;
let cdp = null;

try {
  const chromium = discoverChromium();
  if (!chromium) throw new Error('Chromium executable not found. Set CHROMIUM_BIN to run browser interactions.');
  const port = await reservePort();
  const debuggingPort = await reservePort();
  const vite = join(workspaceRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const output = [];
  server = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--clearScreen', 'false'], {
    cwd: workspaceRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.on('data', chunk => output.push(String(chunk)));
  server.stderr.on('data', chunk => output.push(String(chunk)));

  const url = `http://127.0.0.1:${port}/src/library/data-display/epub-reader/conformance/browser/interaction.html`;
  await waitForServer(url, server, output);
  const browserOutput = [];
  browserProcess = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debuggingPort}`,
    '--window-size=1440,1000',
    '--run-all-compositor-stages-before-draw',
    url,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  browserProcess.stdout.on('data', chunk => browserOutput.push(String(chunk)));
  browserProcess.stderr.on('data', chunk => browserOutput.push(String(chunk)));
  const target = await waitForBrowserTarget(debuggingPort, url, browserProcess, browserOutput);
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  const result = await waitForBrowserReport(cdp, browserProcess, browserOutput);
  report = {
    ...result,
    browser: chromium,
    version: browserVersion(chromium),
  };
  console.log(JSON.stringify(report, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
} catch (error) {
  report = { status: 'not-run', reason: error instanceof Error ? error.message : String(error) };
  console.error(report.reason);
  process.exitCode = 2;
} finally {
  cdp?.close();
  await stopProcess(browserProcess);
  await stopProcess(server);
  writeFileSync(reportPath, JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2) + '\n');
  rmSync(profile, { recursive: true, force: true });
}

async function reservePort() {
  const probe = createServer();
  await new Promise((resolvePromise, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolvePromise, reject) => probe.close(error => error ? reject(error) : resolvePromise()));
  if (!port) throw new Error('Could not reserve a local port for the browser test server.');
  return port;
}

async function waitForServer(url, processHandle, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode != null) throw new Error(`Vite exited ${processHandle.exitCode}: ${output.join('').slice(-4000)}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server may still be binding its port.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
  }
  throw new Error(`Timed out waiting for Vite: ${output.join('').slice(-4000)}`);
}

async function waitForBrowserTarget(port, url, processHandle, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode != null) throw new Error(`Browser exited ${processHandle.exitCode}: ${output.join('').slice(-4000)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(candidate => candidate.type === 'page' && candidate.url === url);
        if (target?.webSocketDebuggerUrl) return target;
      }
    } catch {
      // Chromium may still be starting its debugging endpoint.
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for Chromium debugging target: ${output.join('').slice(-4000)}`);
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 0;
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')), { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

async function waitForBrowserReport(client, processHandle, output) {
  const timeout = Number(process.env.BROWSER_INTERACTION_TIMEOUT_MS ?? 45000);
  const deadline = Date.now() + timeout;
  let lastValue = 'PENDING';
  while (Date.now() < deadline) {
    if (processHandle.exitCode != null) throw new Error(`Browser exited ${processHandle.exitCode}: ${output.join('').slice(-4000)}`);
    const evaluated = await client.send('Runtime.evaluate', {
      expression: "document.getElementById('result')?.textContent ?? 'MISSING'",
      returnByValue: true,
    });
    lastValue = evaluated.result?.value ?? 'MISSING';
    if (lastValue !== 'PENDING' && lastValue !== 'MISSING') return JSON.parse(lastValue);
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser interaction report. Last value: ${lastValue}`);
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode != null) return;
  processHandle.kill();
  await Promise.race([
    new Promise(resolvePromise => processHandle.once('exit', resolvePromise)),
    delay(2000),
  ]);
}

function delay(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}
