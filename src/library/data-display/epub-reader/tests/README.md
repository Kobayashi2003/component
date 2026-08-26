# Test organization

## Suites

- `unit/` covers isolated publication models, rendition policy, renderer geometry and lifecycle, locators, navigation, reader services, and React-facing view models.
- `integration/` covers archive-to-publication loading, resource sessions, React store lifecycle, content compatibility, and conformance reporting.

Test filenames describe the behavior under test and use the `*.test.ts` suffix. Tests must not depend on development-stage numbers.

`support/react.d.ts` is a compile-only React type shim used by the offline test configuration. Production builds use the real React types.

## Related validation

- `fixtures/corpus/` contains deterministic EPUB inputs generated and exercised by the local corpus scripts.
- `fixtures/real-world/manifest.example.json` documents the local real-world manifest format. Run `npm run realworld:bind -- <file-or-directory> [...]` to inspect user-supplied EPUBs and create the ignored `manifest.local.json`; book files and identifying manifest data remain outside version control.
- `conformance/` stores browser, performance, visual, and W3C evidence rather than executable TypeScript tests.
- `.test-results/` contains ignored browser, performance, and visual output and may be regenerated.

## Commands

```bash
npm test
npm run test:unit
npm run test:integration
npm run corpus:test
npm run browser:probe
npm run visual:check
npm run realworld:bind -- /path/to/book-or-directory
npm run realworld:test
```
