# EPUB Reader conformance

This directory stores browser-facing verification definitions and committed
evidence. Executable Node drivers live under `scripts/conformance`; generated
run output lives under the ignored `.test-results` directory.

## Areas

- `browser/` contains the real React interaction page and the browser capability
  matrix. `interaction.tsx` is the stable page entry; its `interaction/`
  directory separates test configuration, scenario steps, and DOM harness
  helpers.
- `visual/` contains the visual case matrix and committed baseline images.
- `w3c/` contains report templates for observing official EPUB test suites.

## Asset boundary

Commit deterministic matrices, harness source, report templates, and reviewed
visual baselines. Do not commit browser profiles, run reports, screenshots made
only for diagnosis, compiled harness code, or locally supplied EPUB books.

The ignored `.test-results/browser` directory receives runtime capability,
interaction, and pagination reports. Other temporary builds use the ignored
`.*-dist` directories documented in [`.gitignore`](../.gitignore).

## Commands

Run from `src/library/data-display/epub-reader`:

```sh
npm run browser:check
npm run visual:check
npm run conformance:pagination
npm run epubcheck:corpus
npm run conformance:w3c:observe
npm run conformance:w3c:report
```

See the [test guide](../tests/README.md) for the normal verification ladder.
