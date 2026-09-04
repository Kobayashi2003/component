import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRealWorldManifest,
  resolveRealWorldCasePath,
} from "./real-world-manifest.mjs";
import { runTypeScript } from "../shared/typescript-cli.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { manifest, manifestPath } = loadRealWorldManifest(root);
const out = join(root, ".realworld-dist");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const observations = [];
let failed = 0;
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

  for (const test of manifest.cases) {
    const file = resolveRealWorldCasePath(manifestPath, test);
    const failures = [];
    if (!existsSync(file)) {
      failures.push(`Missing sample: ${file}`);
      observations.push({
        id: test.id,
        file: basename(file),
        passed: false,
        failures,
      });
      failed += 1;
      continue;
    }
    const bytes = readFileSync(file);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== test.sha256) failures.push(`SHA-256 mismatch: ${sha}`);

    const strict = await core.OcfZipArchive.open(bytes, {}, "strict");
    if (Boolean(strict.archive) !== test.strictArchive)
      failures.push(
        `strict archive expected ${test.strictArchive}, got ${Boolean(strict.archive)}`,
      );

    const opened = await core.OcfZipArchive.open(bytes, {}, "compatible");
    if (!opened.archive) {
      failures.push("compatible mode could not open OCF archive");
      observations.push({
        id: test.id,
        file: basename(file),
        passed: false,
        failures,
        diagnosticCodes: opened.diagnostics.map((d) => d.code),
      });
      failed += 1;
      continue;
    }
    const loaded = await core.loadPublicationFromArchive(
      opened.archive,
      opened.diagnostics,
    );
    if (!loaded.publication) {
      failures.push("package loader did not produce Publication");
      observations.push({
        id: test.id,
        file: basename(file),
        passed: false,
        failures,
        diagnosticCodes: loaded.diagnostics.map((d) => d.code),
      });
      failed += 1;
      continue;
    }
    const publication = loaded.publication;
    const preflight = await core.preflightPublicationContent(
      opened.archive,
      publication,
    );
    const diagnostics = [...loaded.diagnostics, ...preflight.diagnostics];
    const compatibility = core.createCompatibilityReport(diagnostics);
    if (
      compatibility.status === "blocked" ||
      compatibility.status === "degraded"
    )
      failures.push(`compatibility status is ${compatibility.status}`);
    if (publication.spine.length !== test.spineCount)
      failures.push(
        `spine count expected ${test.spineCount}, got ${publication.spine.length}`,
      );
    if (publication.pageProgressionDirection !== test.pageProgressionDirection)
      failures.push(
        `page progression expected ${test.pageProgressionDirection}, got ${publication.pageProgressionDirection}`,
      );

    let verticalCount = 0;
    let prePaginatedCount = 0;
    let reflowableImagePageCount = 0;
    let spanningImageCount = 0;
    let invalidCrossSpineTextPlans = 0;
    let fixedRendererMismatch = 0;
    let rubyDocuments = 0;
    let rubyProjectionChecks = 0;
    let rubyElementChecks = 0;
    let crossSpineSlotChecks = 0;
    let reflowableFirstPagePlacementChecks = 0;
    const semanticSearchDocuments = new Map();
    let semanticSearchNeedle = null;

    for (const item of publication.spine) {
      const hints = preflight.hints.get(item.index);
      if (hints?.writingMode === "vertical-rl") verticalCount += 1;
      if (
        hints?.page?.pageLike &&
        core.resolveSpineRendition(publication, item).layout === "reflowable"
      ) {
        reflowableImagePageCount += 1;
        if (hints.page.likelySpanningSpread) spanningImageCount += 1;
      }
      const rendition = core.resolveSpineRendition(publication, item);
      if (rendition.layout === "pre-paginated") prePaginatedCount += 1;
      const plan = core.planRendition({
        publication,
        spineItem: item,
        viewport: manifest.viewport,
        contentHints: hints,
      });
      if (
        hints?.writingMode === "vertical-rl" &&
        plan.writingMode.value !== "vertical-rl"
      )
        failures.push(
          `spine ${item.index}: vertical preflight did not reach planner`,
        );
      if (
        rendition.layout === "pre-paginated" &&
        plan.renderer !== "fixed-layout"
      )
        fixedRendererMismatch += 1;
      if (
        rendition.layout === "reflowable" &&
        !hints?.page?.pageLike &&
        plan.spread.execution === "cross-spine"
      )
        invalidCrossSpineTextPlans += 1;
      if (hints?.page?.pageLike && plan.spread.mode === "double") {
        const expected = hints.page.likelySpanningSpread
          ? "spanning-document"
          : "cross-spine";
        if (plan.spread.execution !== expected)
          failures.push(
            `spine ${item.index}: page-like image expected ${expected}, got ${plan.spread.execution}`,
          );
      }

      if (plan.spread.execution === "cross-spine") {
        const slots = core.resolveSpreadSlotAssignment(
          publication,
          plan,
          (candidate) =>
            core.planRendition({
              publication,
              spineItem: candidate,
              viewport: manifest.viewport,
              contentHints: preflight.hints.get(candidate.index),
            }).spread.mode === "double",
        );
        crossSpineSlotChecks += 1;
        if (rendition.pageSpread === "left" && slots.activeSlot !== "left")
          failures.push(
            `spine ${item.index}: authored page-spread-left resolved to ${slots.activeSlot}`,
          );
        if (rendition.pageSpread === "right" && slots.activeSlot !== "right")
          failures.push(
            `spine ${item.index}: authored page-spread-right resolved to ${slots.activeSlot}`,
          );
        if (
          item.index === 0 &&
          rendition.pageSpread == null &&
          publication.pageProgressionDirection === "rtl" &&
          slots.activeSlot !== "right"
        ) {
          failures.push(
            "RTL first automatic physical page must occupy the right spread slot",
          );
        }
      }

      if (
        rendition.layout === "reflowable" &&
        plan.spread.execution === "intra-document" &&
        (rendition.pageSpread === "left" || rendition.pageSpread === "right")
      ) {
        reflowableFirstPagePlacementChecks += 1;
        const firstPhysicalSlot =
          plan.pageProgression.value === "rtl" ? "right" : "left";
        const expectedBlank = rendition.pageSpread !== firstPhysicalSlot;
        if (core.reflowableNeedsLeadingBlankPage(plan) !== expectedBlank) {
          failures.push(
            `spine ${item.index}: reflowable first-page placement did not preserve authored ${rendition.pageSpread} slot`,
          );
        }
      }

      if (
        item.path &&
        /x?html?/i.test(item.mediaType) &&
        opened.archive.has(item.path)
      ) {
        const source = await opened.archive.readText(item.path);
        if (source.includes("<ruby") || source.includes(":ruby")) {
          const parsed = core.parseXml(source, item.path, "content");
          if (parsed.root) {
            const samples = core.collectRubySamples(parsed.root, 64);
            if (samples.length > 0) {
              rubyDocuments += 1;
              const text = core.semanticXmlText(parsed.root);
              semanticSearchDocuments.set(item.index, {
                href: item.href,
                text,
              });
              const firstSearchSample =
                samples.find((sample) => sample.base.length >= 2) ?? samples[0];
              if (!semanticSearchNeedle && firstSearchSample?.base)
                semanticSearchNeedle = firstSearchSample.base;
              const rubyElements = collectRubyElements(parsed.root);
              for (const ruby of rubyElements.slice(0, 64)) {
                const sample = core.collectRubySamples(ruby, 1)[0];
                if (!sample?.base) continue;
                rubyElementChecks += 1;
                const projected = core
                  .semanticXmlText(ruby)
                  .replace(/\s+/gu, "");
                const expectedBase = sample.base.replace(/\s+/gu, "");
                if (projected !== expectedBase) {
                  failures.push(
                    `spine ${item.index}: ruby primary projection expected ${JSON.stringify(expectedBase)}, got ${JSON.stringify(projected)}`,
                  );
                  break;
                }
                if (
                  sample.reading &&
                  projected.includes(sample.reading.replace(/\s+/gu, ""))
                ) {
                  failures.push(
                    `spine ${item.index}: ruby reading leaked into ruby primary projection`,
                  );
                  break;
                }
              }
              const sequence = adjacentRubySequence(parsed.root, core);
              if (sequence) {
                rubyProjectionChecks += 1;
                // Adjacent ruby bases are a valuable stronger assertion when the
                // authored markup actually contains such a run. It is not a
                // requirement for every book, so absence does not fail the corpus.
                if (
                  !normalizeSemantic(text).includes(normalizeSemantic(sequence))
                ) {
                  failures.push(
                    `spine ${item.index}: semantic text did not preserve adjacent ruby base text ${JSON.stringify(sequence)}`,
                  );
                }
              }
            }
          }
        }
      }
    }

    if (verticalCount !== test.verticalCount)
      failures.push(
        `vertical count expected ${test.verticalCount}, got ${verticalCount}`,
      );
    if (prePaginatedCount !== test.prePaginatedCount)
      failures.push(
        `pre-paginated count expected ${test.prePaginatedCount}, got ${prePaginatedCount}`,
      );
    if (reflowableImagePageCount !== test.reflowableImagePageCount)
      failures.push(
        `reflowable image-page count expected ${test.reflowableImagePageCount}, got ${reflowableImagePageCount}`,
      );
    if (spanningImageCount !== test.spanningImageCount)
      failures.push(
        `spanning image count expected ${test.spanningImageCount}, got ${spanningImageCount}`,
      );
    if (invalidCrossSpineTextPlans)
      failures.push(
        `${invalidCrossSpineTextPlans} flowing-text spine item(s) incorrectly planned as cross-spine`,
      );
    if (fixedRendererMismatch)
      failures.push(
        `${fixedRendererMismatch} pre-paginated item(s) did not use fixed-layout renderer`,
      );
    const expectRuby = test.expectRuby ?? true;
    if (expectRuby && rubyDocuments === 0)
      failures.push(
        "sample contains no parsed ruby document for semantic-text gate",
      );
    if (expectRuby && rubyElementChecks === 0)
      failures.push(
        "could not validate any ruby element for semantic-text gate",
      );

    if (semanticSearchNeedle) {
      const search = new core.PublicationSearch(publication, {
        async load(spineIndex) {
          const document = semanticSearchDocuments.get(spineIndex);
          if (!document) return null;
          return {
            spineIndex,
            href: document.href,
            text: document.text,
            segments: [],
          };
        },
      });
      const results = await search.search(semanticSearchNeedle, {
        includeNonLinear: true,
      });
      if (results.hits.length === 0)
        failures.push(
          `semantic search could not find ruby base text ${JSON.stringify(semanticSearchNeedle)}`,
        );
    } else if (expectRuby) {
      failures.push("could not choose ruby base text for semantic search gate");
    }

    let cssCompatibilityChecked = false;
    let legacyCssPath = null;
    for (const path of opened.archive.entries) {
      if (!path.toLowerCase().endsWith(".css")) continue;
      const css = await opened.archive.readText(path);
      if (!/-epub-writing-mode|-webkit-writing-mode/iu.test(css)) continue;
      const normalized = core.normalizeLegacyEpubCss(css);
      cssCompatibilityChecked = true;
      legacyCssPath ??= path;
      if (
        !/\bwriting-mode\s*:\s*(?:vertical-rl|horizontal-tb|vertical-lr)/iu.test(
          normalized.css,
        )
      )
        failures.push(
          `legacy CSS normalization did not add standard writing-mode in ${path}`,
        );
    }
    if ((test.expectLegacyWritingMode ?? true) && !cssCompatibilityChecked) {
      failures.push(
        "no legacy writing-mode stylesheet found for CSS compatibility gate",
      );
    }

    // Verify the compatibility normalizer is not only a pure helper: a real
    // PublicationResourceSession must publish the normalized stylesheet bytes.
    if (legacyCssPath) {
      const created = await core.ResourceResolver.create(
        opened.archive,
        publication,
        {
          remotePolicy: "block",
          unmanifestedPolicy: "warn",
        },
      );
      let objectUrlId = 0;
      const objectUrls = new Map();
      const session = new core.PublicationResourceSession(created.resolver, {
        create(bytes, mediaType) {
          const url = `blob:realworld-${++objectUrlId}`;
          objectUrls.set(url, { bytes: bytes.slice(), mediaType });
          return url;
        },
        revoke(url) {
          objectUrls.delete(url);
        },
      });
      try {
        const materialized = await session.materialize("", legacyCssPath);
        const url = materialized.resource?.url?.split("#", 1)[0];
        const entry = url ? objectUrls.get(url) : null;
        const publishedCss = entry ? new TextDecoder().decode(entry.bytes) : "";
        if (
          !publishedCss ||
          !/\bwriting-mode\s*:\s*(?:vertical-rl|horizontal-tb|vertical-lr)/iu.test(
            publishedCss,
          )
        ) {
          failures.push(
            `resource session did not publish normalized legacy writing-mode CSS for ${legacyCssPath}`,
          );
        }
        if (
          !materialized.diagnostics.some(
            (diagnostic) =>
              diagnostic.code === "RESOURCE_LEGACY_EPUB_CSS_NORMALIZED",
          )
        ) {
          failures.push(
            `resource session did not diagnose legacy CSS normalization for ${legacyCssPath}`,
          );
        }
      } finally {
        session.dispose();
      }
    }

    const passed = failures.length === 0;
    if (!passed) failed += 1;
    observations.push({
      id: test.id,
      file: basename(file),
      passed,
      compatibility: compatibility.status,
      spineCount: publication.spine.length,
      verticalCount,
      prePaginatedCount,
      reflowableImagePageCount,
      spanningImageCount,
      rubyDocuments,
      rubyProjectionChecks,
      rubyElementChecks,
      crossSpineSlotChecks,
      reflowableFirstPagePlacementChecks,
      diagnosticCodes: [...new Set(diagnostics.map((d) => d.code))],
      failures,
    });
    console.log(
      `${passed ? "PASS" : "FAIL"} ${test.id} — ${basename(file)} (${compatibility.status})`,
    );
    for (const failure of failures) console.error(`  - ${failure}`);
  }

  const resultDirectory = join(root, ".test-results", "corpus");
  mkdirSync(resultDirectory, { recursive: true });
  writeFileSync(
    join(resultDirectory, "real-world.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), observations },
      null,
      2,
    ) + "\n",
  );
  if (failed) process.exitCode = 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}

function normalizeSemantic(value) {
  return value.replace(/\s+/gu, "");
}

function collectRubyElements(root) {
  const result = [];
  const visit = (element) => {
    if (element.localName?.toLowerCase() === "ruby") result.push(element);
    for (const child of element.children ?? [])
      if (child.type === "element") visit(child);
  };
  visit(root);
  return result;
}

function adjacentRubySequence(root, core) {
  let result = null;
  const visit = (element) => {
    if (result) return;
    let run = [];
    const flush = () => {
      if (run.length >= 2 && !result) result = run.join("");
      run = [];
    };
    for (const child of element.children ?? []) {
      if (child.type === "text") {
        if (child.value.trim()) flush();
        continue;
      }
      if (child.localName?.toLowerCase() === "ruby") {
        const base = core.semanticXmlText(child).replace(/\s+/gu, "");
        if (base) run.push(base);
        continue;
      }
      flush();
      visit(child);
    }
    flush();
  };
  visit(root);
  return result;
}
