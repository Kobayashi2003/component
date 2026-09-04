import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const target = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, "fixtures", "corpus");
const jar = process.env.EPUBCHECK_JAR
  ? resolve(process.env.EPUBCHECK_JAR)
  : join(root, "tools", "epubcheck", "epubcheck.jar");
if (!existsSync(jar)) {
  console.error(
    "EPUBCheck jar not found. Set EPUBCHECK_JAR=/path/to/epubcheck.jar or place the official distribution at tools/epubcheck/.",
  );
  console.error(
    "The conformance suite targets EPUBCheck 5.3.0 for EPUB 3.3 validation; the binary is intentionally not vendored in this project.",
  );
  process.exit(2);
}
const files =
  existsSync(target) && target.toLowerCase().endsWith(".epub")
    ? [target]
    : readdirSync(target)
        .filter((name) => name.toLowerCase().endsWith(".epub"))
        .map((name) => join(target, name));
const reportDir = join(root, ".test-results", "epubcheck");
mkdirSync(reportDir, { recursive: true });
let failed = 0;
for (const file of files) {
  const report = join(reportDir, `${basename(file, ".epub")}.json`);
  const run = spawnSync("java", ["-jar", jar, "--json", report, file], {
    encoding: "utf8",
  });
  console.log(
    `${run.status === 0 ? "PASS" : "INVALID"} ${basename(file)} -> ${report}`,
  );
  if (run.status !== 0) failed += 1;
}
if (failed) process.exitCode = 1;
