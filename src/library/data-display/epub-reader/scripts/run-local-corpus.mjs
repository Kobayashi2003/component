import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTypeScript } from './typescript-cli.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.corpus-dist');
const corpus = join(root, 'fixtures', 'corpus');
const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

try {
  runTypeScript(['-p', join(root, 'tsconfig.core.json'), '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', out], { stdio: 'inherit' });
  writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  const require = createRequire(import.meta.url);
  const { runEpubCorpusCase } = require(join(out, 'core', 'conformance', 'corpus.js'));

  let failed = 0;
  const observations = [];
  for (const test of manifest.cases) {
    const bytes = readFileSync(join(corpus, test.file));
    const result = await runEpubCorpusCase({ ...test, bytes });
    observations.push({ id: test.id, passed: result.passed, publicationOpened: result.publicationOpened, compatibilityStatus: result.compatibilityStatus, diagnosticCodes: result.diagnostics.map(d => d.code), failures: result.failures });
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${test.id} (${result.compatibilityStatus})`);
    if (!result.passed) { failed += 1; for (const failure of result.failures) console.error(`  - ${failure}`); }
  }
  const resultDirectory = join(root, '.test-results', 'corpus');
  mkdirSync(resultDirectory, { recursive: true });
  writeFileSync(join(resultDirectory, 'local.json'), JSON.stringify({ generatedAt: new Date().toISOString(), observations }, null, 2) + '\n');
  if (failed) process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
