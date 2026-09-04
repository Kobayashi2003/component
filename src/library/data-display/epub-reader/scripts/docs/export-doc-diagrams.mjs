import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const diagrams = [
  [
    "docs/diagrams/architecture-overview.drawio",
    "docs/diagrams/architecture-overview.svg",
  ],
];

const absoluteCandidates =
  process.platform === "win32"
    ? [
        process.env.LOCALAPPDATA &&
          resolve(process.env.LOCALAPPDATA, "Programs/draw.io/draw.io.exe"),
        process.env.ProgramFiles &&
          resolve(process.env.ProgramFiles, "draw.io/draw.io.exe"),
        process.env["ProgramFiles(x86)"] &&
          resolve(process.env["ProgramFiles(x86)"], "draw.io/draw.io.exe"),
      ]
    : process.platform === "darwin"
      ? ["/Applications/draw.io.app/Contents/MacOS/draw.io"]
      : [];

const commandCandidates =
  process.platform === "win32"
    ? ["draw.io.exe", "drawio.exe"]
    : ["drawio", "draw.io"];

const configuredExecutable = process.env.DRAWIO_PATH;
const candidates = [
  configuredExecutable,
  ...absoluteCandidates,
  ...commandCandidates,
].filter(Boolean);

function isAbsoluteExecutable(candidate) {
  if (!candidate.includes("/") && !candidate.includes("\\")) return true;

  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function exportDiagram(executable, sourcePath, outputPath) {
  return spawnSync(
    executable,
    [
      "--export",
      "--format",
      "svg",
      "--svg-theme",
      "dark",
      "--crop",
      "--border",
      "20",
      "--output",
      outputPath,
      sourcePath,
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
}

let executable;
for (const candidate of candidates) {
  if (!isAbsoluteExecutable(candidate)) continue;

  const probe = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (!probe.error) {
    executable = candidate;
    break;
  }
}

if (!executable) {
  throw new Error(
    "Draw.io desktop was not found. Install it or set DRAWIO_PATH to the draw.io executable.",
  );
}

for (const [sourcePath, outputPath] of diagrams) {
  const source = resolve(packageRoot, sourcePath);
  const output = resolve(packageRoot, outputPath);
  const result = exportDiagram(executable, source, output);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Draw.io failed to export ${sourcePath}.\n${result.stderr || result.stdout}`,
    );
  }

  console.log(`Exported ${outputPath}`);
}
