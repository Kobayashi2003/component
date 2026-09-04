// Assert the pagination invariants in every browser engine that is available.
//
// Pagination is CSS fragmentation, so a page boundary is a fragmentation break
// and cannot fall inside a line box. That is a structural guarantee rather than
// a tuning, which makes it worth asserting directly: measure every laid-out
// line rect in a chapter and check that none of them spans two pages.
//
// Playwright is an optional developer dependency. Without it this script
// reports the engines it could not reach and exits successfully, so the offline
// regression suite stays deterministic.
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runTypeScript } from "../shared/typescript-cli.mjs";
import {
  measurePagination,
  walkMixedLayout,
} from "./pagination-page-probes.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const build = join(root, ".pagination-dist");
const port = Number(process.env.EPUB_PAGINATION_PORT ?? 8744);
const fixture = join(root, "fixtures", "corpus", "vertical-ruby.epub");
const mixedFixture = join(root, "fixtures", "corpus", "mixed-layout.epub");

const require = createRequire(import.meta.url);
let playwright = null;
try {
  playwright = require("playwright");
} catch {
  try {
    playwright = require("playwright-core");
  } catch {
    playwright = null;
  }
}

for (const path of [fixture, mixedFixture]) {
  if (existsSync(path)) continue;
  console.error(
    `Missing fixture ${relative(root, path)}. Run npm run corpus:generate first.`,
  );
  process.exit(2);
}

if (!playwright) {
  console.log(
    "Pagination conformance: SKIPPED (install playwright to run browser engines)",
  );
  process.exit(0);
}

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });

// The engine ships as TypeScript; emit browser-loadable ESM for the harness.
runTypeScript(
  [
    "-p",
    join(root, "tsconfig.core.json"),
    "--noEmit",
    "false",
    "--declaration",
    "false",
    "--composite",
    "false",
    "--rootDir",
    join(root, "core"),
    "--outDir",
    join(build, "core"),
  ],
  { stdio: "inherit" },
);
addExtensions(build);

writeFileSync(
  join(build, "harness.html"),
  '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>pagination conformance</title>' +
    "<style>body{margin:0}#stage{width:900px;height:560px;background:#fff}</style></head>" +
    '<body><div id="stage"></div></body></html>',
);
writeFileSync(join(build, "book.epub"), readFileSync(fixture));
writeFileSync(join(build, "mixed.epub"), readFileSync(mixedFixture));

const server = createServer((request, response) => {
  const name = (request.url === "/" ? "/harness.html" : request.url).split(
    "?",
  )[0];
  const type = name.endsWith(".html")
    ? "text/html; charset=utf-8"
    : name.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : name.endsWith(".epub")
        ? "application/epub+zip"
        : "application/octet-stream";
  // Read before writing headers, or a miss tries to set a status twice.
  let body = null;
  try {
    body = readFileSync(join(build, decodeURIComponent(name)));
  } catch {
    body = null;
  }
  if (!body) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": type });
  response.end(body);
});
await new Promise((resolve) => server.listen(port, resolve));

const VIEWPORTS = [
  [900, 560],
  [1400, 760],
  [520, 820],
  [760, 420],
  [1280, 900],
];

const failures = [];
const report = {
  generatedBy: "scripts/conformance/run-pagination-conformance.mjs",
  fixture: relative(root, fixture),
  engines: {},
};

for (const engine of ["chromium", "firefox", "webkit"]) {
  const launcher = playwright[engine];
  if (!launcher) continue;
  let browser = null;
  try {
    browser = await launcher.launch();
  } catch (cause) {
    report.engines[engine] = {
      status: "unavailable",
      reason: String(cause?.message ?? cause).split("\n")[0],
    };
    console.log(`${engine}: unavailable (${report.engines[engine].reason})`);
    continue;
  }
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message)));
    await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
    const result = await page.evaluate(measurePagination, VIEWPORTS);
    const visited = await page.evaluate(walkMixedLayout, 40);
    const seen = new Set(visited[0]?.showing ?? []);
    result.walk = visited;

    for (const error of pageErrors)
      failures.push(`${engine}: page error ${error}`);
    if (result.samples.length !== VIEWPORTS.length) {
      failures.push(
        `${engine}: measured ${result.samples.length} of ${VIEWPORTS.length} viewports`,
      );
    }
    for (const sample of result.samples) {
      const where = `${engine} @ ${sample.viewport}`;
      if (sample.writingMode === "horizontal-tb")
        failures.push(`${where}: fixture did not resolve to vertical writing`);
      if (sample.columnFill !== "auto")
        failures.push(
          `${where}: expected CSS multicol fragmentation, got column-fill ${sample.columnFill}`,
        );
      if (sample.scrollAxis !== "vertical")
        failures.push(
          `${where}: vertical pagination must advance on Y, got ${sample.scrollAxis}`,
        );
      if (sample.straddling > 0)
        failures.push(
          `${where}: ${sample.straddling} of ${sample.rects} line rects cross a page boundary`,
        );
      if (!sample.advanceMatchesViewport)
        failures.push(
          `${where}: page advance ${sample.advance} is not one viewport`,
        );
      if (!sample.scrollLandsOnPage)
        failures.push(
          `${where}: scroll position does not land on a page boundary`,
        );
      if (sample.rubyOverflow != null && sample.rubyOverflow > 0)
        failures.push(
          `${where}: ruby overflows the page edge by ${sample.rubyOverflow.toFixed(1)}px`,
        );
    }
    // Every page turn must land somewhere the product can describe and the
    // reader can actually read.
    for (const stop of visited) {
      const where = `${engine} @ spine ${stop.spine} (${stop.href})`;
      if (stop.currentPage == null || stop.pageCount == null) {
        failures.push(
          `${where}: page turn landed on a page that reports no position`,
        );
      }
      if (!stop.matchedSurface) {
        failures.push(
          `${where}: no content surface matches the active spine item`,
        );
      } else if (stop.renderer !== "fixed-layout" && stop.painted === 0) {
        failures.push(`${where}: page turn landed on a blank page`);
      }
      if (stop.chrome !== "standard") {
        failures.push(
          `${where}: mixed-layout publication must keep standard chrome, got ${stop.chrome}`,
        );
      }
    }

    // Every page turn has to put something new on screen. Re-composing the
    // spread already being shown, or re-showing a document that was just read
    // on its own, spends the turn and reads as a control that does nothing.
    for (let i = 1; i < visited.length; i += 1) {
      const previous = visited[i - 1];
      const current = visited[i];
      const sameDocuments =
        previous.showing.length === current.showing.length &&
        previous.showing.every(
          (title, index) => title === current.showing[index],
        );
      if (
        !current.boundary &&
        sameDocuments &&
        previous.scrollTop === current.scrollTop
      ) {
        failures.push(
          `${engine}: page turn ${i} showed exactly what turn ${i - 1} did (${current.showing.join(" + ")})`,
        );
      }
      const revisited = current.boundary
        ? []
        : current.showing.filter(
            (title) => !previous.showing.includes(title) && seen.has(title),
          );
      for (const title of revisited) {
        failures.push(
          `${engine}: page turn ${i} went back to ${title}, which had already been read`,
        );
      }
      for (const title of current.showing) seen.add(title);
    }

    if (result.roundTrip.before !== result.roundTrip.back) {
      failures.push(
        `${engine}: page turn did not round trip (${result.roundTrip.before} → ${result.roundTrip.forward} → ${result.roundTrip.back})`,
      );
    }

    report.engines[engine] = { status: "automated", ...result };
    const total = result.samples.reduce((sum, sample) => sum + sample.rects, 0);
    const bad = result.samples.reduce(
      (sum, sample) => sum + sample.straddling,
      0,
    );
    const blank = visited.filter(
      (stop) => stop.renderer !== "fixed-layout" && stop.painted === 0,
    ).length;
    const positionless = visited.filter(
      (stop) => stop.currentPage == null,
    ).length;
    console.log(
      `${engine}: ${bad === 0 ? "PASS" : "FAIL"} — ${bad} of ${total} line rects cross a page boundary; ` +
        `mixed-layout walk ${visited.length} stops, ${blank} blank, ${positionless} without a position`,
    );
  } catch (cause) {
    failures.push(
      `${engine}: ${String(cause?.message ?? cause).split("\n")[0]}`,
    );
    report.engines[engine] = {
      status: "error",
      reason: String(cause?.message ?? cause).split("\n")[0],
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

server.close();

const results = join(root, ".test-results", "browser");
mkdirSync(results, { recursive: true });
writeFileSync(
  join(results, "pagination.json"),
  JSON.stringify(report, null, 2) + "\n",
);
rmSync(build, { recursive: true, force: true });

if (
  Object.values(report.engines).every((entry) => entry.status !== "automated")
) {
  console.log(
    "Pagination conformance: SKIPPED (no browser engine could be launched)",
  );
  process.exit(0);
}
if (failures.length > 0) {
  console.error(`Pagination conformance failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Pagination conformance: PASS");

/**
 * TypeScript emits extensionless relative specifiers, which a browser cannot
 * resolve. Rewrite them against what was actually emitted.
 */
function addExtensions(directory) {
  const { readdirSync, statSync } = require("node:fs");
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith(".js")) continue;
      const source = readFileSync(path, "utf8");
      const next = source.replace(
        /((?:^|[\s;{,(])(?:import|export)\b[^'"\n]*?from\s*|import\s*\(\s*)(['"])(\.\.?\/[^'"]*)\2/gm,
        (whole, head, quote, specifier) =>
          head + quote + resolveSpecifier(dirname(path), specifier) + quote,
      );
      if (next !== source) writeFileSync(path, next);
    }
  };
  walk(directory);
}

function resolveSpecifier(base, specifier) {
  if (specifier.endsWith(".js")) return specifier;
  if (existsSync(join(base, `${specifier}.js`))) return `${specifier}.js`;
  if (existsSync(join(base, specifier, "index.js")))
    return `${specifier.replace(/\/$/, "")}/index.js`;
  return specifier;
}
