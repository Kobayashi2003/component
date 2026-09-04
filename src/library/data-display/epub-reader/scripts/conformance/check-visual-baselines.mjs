import { existsSync, readFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const matrixPath = join(root, "conformance", "visual", "matrix.json");
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
const requiredStates = [
  "empty",
  "loading",
  "reading",
  "immersive-hidden",
  "search-panel",
  "portrait-single",
  "landscape-double",
  "warning-panel",
  "error",
];
const requiredContentTypes = [
  "empty",
  "text-horizontal",
  "text-vertical",
  "fixed-rtl",
  "failure",
];
const ids = new Set();
const failures = [];

if (matrix.version !== 1 || !Array.isArray(matrix.cases))
  failures.push("matrix must use version 1 and contain a cases array");

for (const entry of matrix.cases ?? []) {
  if (!entry.id || ids.has(entry.id))
    failures.push(
      `case id is missing or duplicated: ${entry.id ?? "<missing>"}`,
    );
  ids.add(entry.id);
  if (!(entry.viewport?.width > 0) || !(entry.viewport?.height > 0))
    failures.push(`${entry.id}: viewport must have positive dimensions`);
  if (!entry.source?.kind || !entry.contentType || !entry.state)
    failures.push(`${entry.id}: source, contentType and state are required`);
  if (entry.localOnly && entry.baseline)
    failures.push(
      `${entry.id}: local-only real-book cases must not declare committed baselines`,
    );
  if (entry.baseline) {
    const visualRoot = join(root, "conformance", "visual");
    const path = resolve(visualRoot, normalize(entry.baseline));
    if (!path.startsWith(resolve(visualRoot)))
      failures.push(
        `${entry.id}: baseline escapes the visual conformance directory`,
      );
    else if (!existsSync(path))
      failures.push(`${entry.id}: missing baseline ${entry.baseline}`);
    else {
      const dimensions = pngDimensions(readFileSync(path));
      if (!dimensions || dimensions.width < 240 || dimensions.height < 180)
        failures.push(`${entry.id}: baseline is not a valid, useful PNG`);
    }
  }
}

for (const state of requiredStates)
  if (!matrix.cases.some((entry) => entry.state === state))
    failures.push(`missing state coverage: ${state}`);
for (const type of requiredContentTypes)
  if (!matrix.cases.some((entry) => entry.contentType === type))
    failures.push(`missing content-type coverage: ${type}`);

if (process.env.EPUB_VISUAL_RESULTS_REQUIRED === "1") {
  const results = resolve(root, matrix.resultDirectory);
  for (const entry of matrix.cases) {
    const path = join(results, `${entry.id}.png`);
    if (!existsSync(path) || !pngDimensions(readFileSync(path)))
      failures.push(`${entry.id}: missing or invalid local result ${path}`);
  }
}

if (failures.length > 0) {
  console.error(`Visual baseline check failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Visual baseline matrix: PASS (${matrix.cases.length} cases, ${matrix.cases.filter((entry) => entry.baseline).length} committed baselines)`,
  );
}

function pngDimensions(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature)
    return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
