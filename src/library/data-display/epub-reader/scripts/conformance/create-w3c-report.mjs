import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

const directory = process.env.EPUB_TESTS_DIR
  ? resolve(process.env.EPUB_TESTS_DIR)
  : null;
if (!directory) {
  console.error(
    "Set EPUB_TESTS_DIR to a directory containing generated W3C epub-tests .epub files.",
  );
  console.error(
    "This script creates a W3C-compatible report skeleton; it does not pretend that opening a test EPUB means the normative pass criteria were satisfied.",
  );
  process.exit(2);
}
const ids = readdirSync(directory)
  .filter((name) => name.endsWith(".epub"))
  .map((name) => basename(name, ".epub"))
  .sort();
const report = {
  name: "EPUB Reader Engine",
  variant: "Web",
  tested_by: "implementer",
  tests: Object.fromEntries(ids.map((id) => [id, null])),
};
const output = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, ".test-results", "w3c", "epub33-report.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`Created ${output} with ${ids.length} not-run test entries.`);
