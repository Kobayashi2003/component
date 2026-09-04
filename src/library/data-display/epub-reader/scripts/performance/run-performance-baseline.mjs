import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  loadRealWorldManifest,
  resolveRealWorldCasePath,
} from "../corpus/real-world-manifest.mjs";
import { runTypeScript } from "../shared/typescript-cli.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { manifest, manifestPath } = loadRealWorldManifest(root);
const out = join(root, ".performance-dist");
const reportDirectory = join(root, ".test-results", "performance");
const maxTotalMs = Math.max(
  1,
  Number(process.env.EPUB_PERFORMANCE_MAX_TOTAL_MS ?? 5000),
);
const maxHeapDeltaMiB = Math.max(
  1,
  Number(process.env.EPUB_PERFORMANCE_MAX_HEAP_DELTA_MIB ?? 128),
);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(reportDirectory, { recursive: true });

try {
  runTypeScript(
    [
      "-p",
      join(root, "tsconfig.core.json"),
      "--noEmit",
      "false",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--outDir",
      out,
    ],
    { stdio: "inherit" },
  );
  writeFileSync(
    join(out, "package.json"),
    JSON.stringify({ type: "commonjs" }),
  );
  const require = createRequire(import.meta.url);
  const core = require(join(out, "core", "index.js"));
  const rows = [];

  for (const test of manifest.cases) {
    const file = resolveRealWorldCasePath(manifestPath, test);
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    if (global.gc) global.gc();
    const heapBefore = process.memoryUsage().heapUsed;

    const archiveStart = performance.now();
    const opened = await core.OcfZipArchive.open(bytes, {}, "compatible");
    const archiveMs = performance.now() - archiveStart;
    if (!opened.archive) throw new Error(`Could not open ${file}`);

    const packageStart = performance.now();
    const loaded = await core.loadPublicationFromArchive(
      opened.archive,
      opened.diagnostics,
    );
    const packageMs = performance.now() - packageStart;
    if (!loaded.publication)
      throw new Error(`Could not load package for ${file}`);

    const preflightStart = performance.now();
    await core.preflightPublicationContent(opened.archive, loaded.publication);
    const preflightMs = performance.now() - preflightStart;
    if (global.gc) global.gc();
    const heapDeltaMiB =
      (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
    const row = {
      id: test.id,
      file: basename(file),
      sizeMiB: round(bytes.byteLength / 1024 / 1024),
      spineItems: loaded.publication.spine.length,
      archiveMs: round(archiveMs),
      packageMs: round(packageMs),
      preflightMs: round(preflightMs),
      totalMs: round(archiveMs + packageMs + preflightMs),
      heapDeltaMiB: round(heapDeltaMiB),
    };
    rows.push(row);
    console.log(
      `${row.id}: ${row.totalMs} ms (${row.sizeMiB} MiB, ${row.spineItems} spine items)`,
    );
  }

  const violations = rows.flatMap((row) => [
    ...(row.totalMs > maxTotalMs
      ? [`${row.id}: total ${row.totalMs} ms exceeded ${maxTotalMs} ms`]
      : []),
    ...(row.heapDeltaMiB > maxHeapDeltaMiB
      ? [
          `${row.id}: heap delta ${row.heapDeltaMiB} MiB exceeded ${maxHeapDeltaMiB} MiB`,
        ]
      : []),
  ]);
  const report = {
    generatedAt: new Date().toISOString(),
    status: violations.length ? "fail" : "pass",
    gcAvailable: Boolean(global.gc),
    budgets: { maxTotalMs, maxHeapDeltaMiB },
    violations,
    rows,
  };
  writeFileSync(
    join(reportDirectory, "real-world.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (violations.length)
    throw new Error(
      `Performance budget failed with ${violations.length} violation(s).`,
    );
} finally {
  rmSync(out, { recursive: true, force: true });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
