# 04 · EPUB processing

Opening is a staged, abortable pipeline. Every stage keeps archive safety and authored-book compatibility separate from application-code compatibility.

```text
source bytes
  → preferences + extension configuration
  → immutable Compatibility Profile
  → OCF archive safety and container discovery
  → package, reading order, metadata, navigation
  → render-critical content preflight
  → publication resource session
  → rendition plan and first renderer commit
  → idle completion of the remaining preflight
```

## Archive and package

`core/epub/archive/` validates ZIP/OCF structure, paths, size limits, and the container document. `core/epub/publication/` selects a package document and normalizes metadata, manifest resources, reading order, page progression, rendition metadata, table of contents, landmarks, and page-list information.

The default archive mode is practical compatibility: recoverable authored-book defects may produce diagnostics and a usable Publication. Strict mode rejects recoverable OCF violations as well. Neither mode allows compatibility rules to bypass archive or safe-path limits.

## Compatibility Profile

`configureReaderExtensions()` combines built-in and host-contributed Compatibility Modules. At the start of opening, the requested preferences resolve those modules and their same-stage dependencies into one ordered, immutable profile with a deterministic signature. The profile is available to package selection and every later content/resource stage, but no module runs before or bypasses OCF archive safety.

Built-in rules currently cover preferred rootfile selection, legacy NCX/Guide navigation fallback, malformed XHTML recovery, legacy writing-mode interpretation, legacy CSS aliases, IDPF font deobfuscation, and single-image fitting.

Compatibility applies to authored EPUB books. It is not a migration layer for older application state, older code contracts, or obsolete test data. Preference changes are staged for the next reopen so one Reading Session never parses and renders different chapters under different profiles.

## Preflight and resources

The first visible layout waits for the requested reading-order item and its immediate neighbors. This window is enough to resolve the first plan and a possible cross-item spread. Navigation awaits the same local window for a new target; a deduplicated idle task completes the rest of the publication afterward.

One publication-scoped content pipeline supplies both rendering and search analysis, so parsing and compatibility repair cannot drift between features. Shared promises prevent duplicate reads and stylesheet analysis.

`PublicationResourceSession` owns rewritten URLs and resource adaptation for the opened publication. Live documents and renderers are disposed before their object URLs are revoked. Replacing or closing the source aborts unfinished work and releases the complete session.

## Diagnostics

Recoveries and failures become structured publication diagnostics. Core aggregates them into the immutable Reader Snapshot and reports them through `onDiagnostics`; the React compatibility tool presents the same state without implementing a second rules engine.
