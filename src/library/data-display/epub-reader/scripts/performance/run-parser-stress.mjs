import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { runTypeScript } from "../shared/typescript-cli.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const out = join(root, ".stress-dist");
const reportDirectory = join(root, ".test-results", "performance");
const fixture = readFileSync(
  join(root, "fixtures", "corpus", "valid-reflowable.epub"),
);
const iterations = Math.max(
  1,
  Number(process.env.EPUB_STRESS_ITERATIONS ?? 250),
);
const maxHeapGrowth = Math.max(
  0,
  Number(process.env.EPUB_STRESS_MAX_HEAP_GROWTH ?? 32 * 1024 * 1024),
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
  const { loadEpub } = require(
    join(out, "core", "epub", "publication", "loader.js"),
  );

  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  const started = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const loaded = await loadEpub(fixture);
    if (!loaded.publication)
      throw new Error(`stress iteration ${i} failed to open valid fixture`);
    if (loaded.diagnostics.some((d) => d.severity === "fatal"))
      throw new Error(`stress iteration ${i} produced fatal diagnostics`);
  }
  if (global.gc) global.gc();
  const durationMs = performance.now() - started;
  const after = process.memoryUsage().heapUsed;
  const growth = after - before;
  const report = {
    iterations,
    durationMs: Math.round(durationMs * 100) / 100,
    averageMs: Math.round((durationMs / iterations) * 1000) / 1000,
    heapBefore: before,
    heapAfter: after,
    heapGrowth: growth,
    gcAvailable: Boolean(global.gc),
    maxHeapGrowth,
  };
  writeFileSync(
    join(reportDirectory, "parser-stress.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (global.gc && growth > maxHeapGrowth)
    throw new Error(`heap growth ${growth} exceeded budget ${maxHeapGrowth}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
