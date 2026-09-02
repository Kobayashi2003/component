import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browserVersion, discoverChromium } from './chromium-runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'epub-reader-browser-probe-'));
const reportDirectory = join(root, '.test-results', 'browser');
const reportPath = join(reportDirectory, 'runtime.json');
mkdirSync(tmp, { recursive: true });
mkdirSync(reportDirectory, { recursive: true });
const html = join(tmp, 'probe.html');
writeFileSync(html, `<!doctype html><meta charset="utf-8"><body id="result">PENDING</body><script>
const verticalHost = document.createElement('div');
verticalHost.style.cssText = 'position:absolute;left:400px;top:0;width:160px;height:240px;writing-mode:vertical-rl;overflow:visible;font:16px/20px serif;margin:0;padding:0';
const verticalText = document.createTextNode('縦書きページ検証'.repeat(240));
verticalHost.append(verticalText);
document.body.append(verticalHost);
const verticalRange = document.createRange();
verticalRange.selectNodeContents(verticalText);
const verticalRects = Array.from(verticalRange.getClientRects());
const verticalHostRect = verticalHost.getBoundingClientRect();
const verticalMinX = Math.min(...verticalRects.map(rect => rect.left));
const verticalMaxBottom = Math.max(...verticalRects.map(rect => rect.bottom));
const verticalNativeBlockOverflow =
  verticalRects.length > 1
  && verticalMinX < verticalHostRect.left - 1
  && verticalMaxBottom <= verticalHostRect.bottom + 1;
verticalHost.remove();

const result = {
  DOMParser: typeof DOMParser === 'function',
  ResizeObserver: typeof ResizeObserver === 'function',
  DecompressionStream: typeof DecompressionStream === 'function',
  objectURL: typeof URL.createObjectURL === 'function',
  cssColumns: CSS.supports('column-width','10px'),
  cssContainerQueries: CSS.supports('container-type','inline-size'),
  writingMode: CSS.supports('writing-mode','vertical-rl'),
  logicalProperties: CSS.supports('margin-inline-start','1px'),
  textCombineUpright: CSS.supports('text-combine-upright','all'),
  verticalNativeBlockOverflow,
  iframeSandbox: 'sandbox' in document.createElement('iframe'),
  iframeSrcdoc: 'srcdoc' in document.createElement('iframe'),
  intlSegmenter: typeof Intl.Segmenter === 'function'
};
document.getElementById('result').textContent = JSON.stringify(result);
</script>`);

let report = { status: 'not-run', reason: 'unknown' };
try {
  const chromium = discoverChromium();
  if (!chromium) {
    report = { status: 'not-run', reason: 'chromium executable not found' };
    console.error('Chromium executable not found. Set CHROMIUM_BIN to run the runtime probe.');
    process.exitCode = 2;
  } else {
    const version = browserVersion(chromium);
    const run = spawnSync(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--dump-dom', pathToFileURL(html).href], { encoding: 'utf8', timeout: Number(process.env.BROWSER_PROBE_TIMEOUT_MS ?? 15000) });
    if (run.error) {
      report = { status: 'not-run', browser: chromium, version, reason: run.error.message };
      console.error(`Browser runtime probe could not execute: ${run.error.message}`);
      process.exitCode = 2;
    } else if (run.status !== 0) {
      report = { status: 'not-run', browser: chromium, version, reason: `browser exited ${run.status}`, stderr: (run.stderr || '').slice(-4000) };
      console.error(`Browser runtime probe exited ${run.status}.`);
      process.exitCode = 2;
    } else {
      const match = /<body id="result">([^<]+)<\/body>/.exec(run.stdout ?? '');
      if (!match) throw new Error('Browser probe result was not found in dumped DOM.');
      const capabilities = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
      const passed = Object.values(capabilities).every(value => value === true);
      report = { status: passed ? 'pass' : 'fail', browser: chromium, version, capabilities };
      console.log(JSON.stringify(report, null, 2));
      if (!passed) process.exitCode = 1;
    }
  }
} catch (error) {
  report = { status: 'not-run', reason: error instanceof Error ? error.message : String(error) };
  console.error(report.reason);
  process.exitCode = 2;
} finally {
  writeFileSync(reportPath, JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2) + '\n');
  rmSync(tmp, { recursive: true, force: true });
}
