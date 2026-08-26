import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTypeScript } from './typescript-cli.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const suite = process.env.EPUB_TESTS_DIR ? resolve(process.env.EPUB_TESTS_DIR) : null;
if (!suite) {
  console.error('Set EPUB_TESTS_DIR to a directory containing generated W3C EPUB test publications.');
  process.exit(2);
}
const files = readdirSync(suite).filter(name => name.endsWith('.epub')).sort();
const out = join(root, '.w3c-observe-dist');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
try {
  runTypeScript(['-p', join(root, 'tsconfig.core.json'), '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', out], { stdio: 'inherit' });
  writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  const require = createRequire(import.meta.url);
  const { loadEpub } = require(join(out, 'core', 'publication', 'loader.js'));
  const { createCompatibilityReport } = require(join(out, 'core', 'compatibility', 'report.js'));
  const observations = [];
  for (const file of files) {
    const loaded = await loadEpub(readFileSync(join(suite, file)));
    const compatibility = createCompatibilityReport(loaded.diagnostics);
    observations.push({
      id: basename(file, '.epub'),
      opened: Boolean(loaded.publication),
      compatibility: compatibility.status,
      diagnostics: loaded.diagnostics.map(diagnostic => ({ code: diagnostic.code, severity: diagnostic.severity, repaired: Boolean(diagnostic.repair) })),
    });
  }
  const output = resolve(process.argv[2] ?? join(root, 'conformance', 'w3c', 'loader-observations.json'));
  writeFileSync(output, JSON.stringify({ warning: 'Loader observations are not W3C conformance results. Apply each test publication pass criteria separately.', observations }, null, 2) + '\n');
  console.log(`Observed ${files.length} W3C test EPUBs -> ${output}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
