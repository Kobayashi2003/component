# EPUB Reader scripts

These scripts maintain and verify the EPUB Reader package. They are grouped by
purpose; npm command names remain the supported way to run them.

## Directories

- `shared/` contains environment adapters reused by several script groups.
- `verification/` runs static boundary checks and TypeScript test suites.
- `conformance/` runs browser, pagination, visual, EPUBCheck, and W3C checks.
- `corpus/` creates and runs synthetic or locally bound real-world EPUB sets.
- `performance/` runs parser stress and real-world performance baselines.
- `docs/` exports documentation assets.

## Conventions

1. Resolve package paths from `import.meta.url`; do not depend on the caller's
   current directory unless the command explicitly accepts a user path.
2. Write generated output only to ignored `.*-dist` or `.test-results`
   directories, except for intentional committed fixtures and documentation
   assets.
3. Keep reusable process/browser adapters in `shared`; keep one-off helpers
   beside the runner that owns them.
4. A browser-evaluated function belongs in a separate module when it has a
   different execution environment from its Node driver.
5. Preserve npm command names when moving implementation files.
6. A missing optional external tool must report whether the check failed,
   skipped, or requires setup.

See [`package.json`](../package.json) for the command catalog and
[`tests/README.md`](../tests/README.md) for verification levels.
