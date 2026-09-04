import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const typescriptCli = require.resolve("typescript/bin/tsc");

/** Execute the installed TypeScript CLI without relying on platform-specific tsc shims. */
export function runTypeScript(args, options = {}) {
  const effectiveArgs = args.includes("--ignoreDeprecations")
    ? args
    : [...args, "--ignoreDeprecations", "6.0"];
  return execFileSync(
    process.execPath,
    [typescriptCli, ...effectiveArgs],
    options,
  );
}
