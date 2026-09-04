import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function discoverChromium() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    process.env.CHROME_BIN,
    ...(process.platform === "win32"
      ? [
          join(
            process.env.PROGRAMFILES ?? "",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          join(
            process.env["PROGRAMFILES(X86)"] ?? "",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          join(
            process.env.LOCALAPPDATA ?? "",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          join(
            process.env.PROGRAMFILES ?? "",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
          join(
            process.env["PROGRAMFILES(X86)"] ?? "",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
        ]
      : []),
    ...(process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : []),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/microsoft-edge",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

export function browserVersion(executable) {
  if (process.platform === "win32") {
    const escaped = executable.replaceAll("'", "''");
    const run = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion`,
      ],
      { encoding: "utf8", timeout: 5000 },
    );
    return (run.stdout || "").trim() || "unknown";
  }
  const run = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    timeout: 5000,
  });
  return (run.stdout || run.stderr || "").trim() || "unknown";
}
