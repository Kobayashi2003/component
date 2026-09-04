# Test organization

## Suites

- `unit/` covers isolated publication models, rendition policy, renderer geometry and lifecycle, locators, navigation, reader services, strict Reading Session decoding, React-facing view models (including publication-scoped settings visibility), controlled Tool and Surface Renderer registries, and validated UI configuration.
- `integration/` covers archive-to-publication loading, resource sessions, React store lifecycle, content compatibility, and conformance reporting.
- `conformance/browser/interaction.html` runs the real React showcase in headless Chromium and exercises file selection, pagination, built-in and contributed Tool panels, focused settings and maintenance, configured Surface Renderers, ARIA relationships, keyboard focus, modal isolation, search, and reading-session persistence.

Test filenames describe the behavior under test and use the `*.test.ts` suffix. Tests must not depend on development-stage numbers.

Keep one test file focused on one domain or lifecycle boundary. When a broad
regression grows to cover an independent subsystem, split that subsystem into a
peer test and register it in `scripts/verification/run-tests.mjs`; do not divide
tests into arbitrary equal-sized fragments.

`support/react.d.ts` is a compile-only React type shim used by the offline test configuration. Production builds use the real React types.

## Related validation

- `fixtures/corpus/` contains deterministic EPUB inputs generated and exercised by the local corpus scripts.
- `fixtures/real-world/manifest.example.json` documents the local real-world manifest format. Run `npm run realworld:bind -- <file-or-directory> [...]` to inspect user-supplied EPUBs and create the ignored `manifest.local.json`; book files and identifying manifest data remain outside version control.
- `conformance/` stores browser, visual, and W3C definitions and evidence rather than ordinary TypeScript unit tests. Its [README](../conformance/README.md) records the committed/generated asset boundary.
- `.test-results/` contains ignored browser, performance, and visual output and may be regenerated.

## Commands

```bash
npm test
npm run test:unit
npm run test:integration
npm run corpus:test
npm run browser:probe
npm run browser:interactions
npm run browser:check
npm run visual:check
npm run realworld:bind -- /path/to/book-or-directory
npm run realworld:test
```
