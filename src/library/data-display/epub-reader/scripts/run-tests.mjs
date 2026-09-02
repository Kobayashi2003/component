import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTypeScript } from './typescript-cli.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const requestedSuite = process.argv[2] ?? 'all';
const suites = {
  unit: [
    'tests/unit/publication-model.test.js',
    'tests/unit/rendition-planner.test.js',
    'tests/unit/renderer-lifecycle.test.js',
    'tests/unit/extension-mechanisms.test.js',
    'tests/unit/reader-extension-configuration.test.js',
    'tests/unit/compatibility-modules.test.js',
    'tests/unit/reflowable-pagination.test.js',
    'tests/unit/fixed-layout-spreads.test.js',
    'tests/unit/navigation-locators.test.js',
    'tests/unit/footnote-semantics.test.js',
    'tests/unit/reader-features.test.js',
    'tests/unit/panel-model.test.js',
    'tests/unit/feedback-model.test.js',
    'tests/unit/external-link-model.test.js',
    'tests/unit/reader-chrome-model.test.js',
    'tests/unit/content-preflight-css.test.js',
    'tests/unit/content-document-cache.test.js',
  ],
  integration: [
    'tests/integration/publication-loading.test.js',
    'tests/integration/resource-session.test.js',
    'tests/integration/react-reader-store.test.js',
    'tests/integration/conformance-reporting.test.js',
    'tests/integration/content-compatibility.test.js',
  ],
};
if (requestedSuite !== 'all' && !(requestedSuite in suites)) {
  console.error(`Unknown test suite: ${requestedSuite}. Use unit, integration, or all.`);
  process.exit(2);
}
const out = mkdtempSync(join(tmpdir(), `epub-reader-${requestedSuite}-`));

try {
  // Compile core + React adapter with the local verification-only React type
  // contract. Real consumers install React/@types/react through package.json;
  // this path lets the engine regression suite remain deterministic/offline.
  runTypeScript([
    '-p', join(root, 'tsconfig.test.json'),
    '--noEmit', 'false',
    '--module', 'commonjs',
    '--moduleResolution', 'node',
    '--outDir', out,
  ], { stdio: 'inherit' });

  writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }));

  const files = requestedSuite === 'all'
    ? [...suites.unit, ...suites.integration]
    : suites[requestedSuite];
  for (const file of files) {
    execFileSync(process.execPath, [join(out, file)], { stdio: 'inherit' });
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
