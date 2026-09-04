import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export function loadRealWorldManifest(root) {
  const manifestPath = resolve(
    process.env.EPUB_REALWORLD_MANIFEST ??
      join(root, "fixtures", "real-world", "manifest.local.json"),
  );
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Real-world manifest not found. Run \"npm run realworld:bind -- <file-or-directory> [...]\" first, or set EPUB_REALWORLD_MANIFEST. Expected: ${manifestPath}`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length === 0
  ) {
    throw new Error(
      `Real-world manifest must use version 1 and contain at least one case: ${manifestPath}`,
    );
  }
  return { manifest, manifestPath };
}

export function resolveRealWorldCasePath(manifestPath, test) {
  if (typeof test.path !== "string" || test.path.length === 0)
    throw new Error(`Real-world case ${test.id ?? "<unknown>"} has no path.`);
  return isAbsolute(test.path)
    ? test.path
    : resolve(dirname(manifestPath), test.path);
}
