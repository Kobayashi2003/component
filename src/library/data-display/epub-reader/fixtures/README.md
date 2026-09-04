# EPUB fixtures

Fixtures are publication inputs for automated verification. They are test data,
not runtime assets or Showcase examples.

- `corpus/` contains deterministic synthetic EPUBs and a committed manifest.
  Regenerate them with `npm run corpus:generate` and execute them with
  `npm run corpus:test`.
- `real-world/` documents the local manifest format for user-supplied EPUBs.
  Real books and the generated `manifest.local.json` remain ignored and outside
  version control.

Synthetic fixtures should be minimal, deterministic, and named after the
behavior they exercise. Do not add copyrighted or identifying real-world books
to the repository.
