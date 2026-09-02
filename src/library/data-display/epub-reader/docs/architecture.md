# EPUB Reader Architecture

## Overview

The EPUB reader is split into a framework-independent engine, a browser rendering boundary, and a React product shell. The host supplies EPUB bytes; the reader owns publication processing and exposes immutable state snapshots plus semantic commands.

```text
EPUB source
  → archive and package loading
  → content preflight and compatibility repair
  → rendition planning
  → renderer and navigation orchestration
  → reader snapshot
  → React interface
```

## Layers

### Host and showcase

`showcase/` and `EpubReaderBackground` are demonstration-only. They handle local file selection, replacement, and presentation around the reusable reader. They do not participate in EPUB parsing or rendering.

### React adapter and interface

`react/` is organized by product responsibility. `state/` adapts the core to React through the external store, public models, hooks, and browser persistence adapters. `reader/` composes the reader shell and viewport. `chrome/` owns persistent controls and UI state, `panels/` owns navigable tool panels, `overlays/` owns transient interactions, and `source/` contains the host-facing local file picker. The stable public surface remains `react/index.ts`.

`ReactEpubReaderStore` owns asynchronous open/replace/dispose races and viewport observation. The UI subscribes to immutable snapshots and invokes reader commands; it does not manipulate publication documents directly.

### Reader orchestration

`core/runtime/reader/` composes the engine. `BrowserEpubReader` coordinates the active renderer, navigation history, locators, search, marks, selection, media activation, input routing, diagnostics, and preferences. `core/runtime/session/` owns the framework-neutral reading-session record, current-schema validation, persistence port, and publication fingerprint. This layer is the public browser-facing boundary for the core.

### EPUB format processing

`core/epub/` owns format-specific work. Its `archive/` and `publication/` modules read the OCF container and convert package/navigation documents into a normalized publication model. `content/`, `resources/`, `text/`, and `xml/` preflight and materialize spine documents while keeping temporary URLs and compatibility repairs explicit.

Content preflight is staged through one publication-scoped session. Opening waits only for the requested spine item and its immediate neighbours, which is enough to plan the first page and any cross-spine spread without a corrective render. Every later navigation awaits the same local window before planning. Once the first layout is ready, an idle-time pass completes the remaining profile; per-item promises and stylesheet reads are shared across all three paths. Completion can refine the publication's dominant writing mode once, while renderer-derived hints remain authoritative. Disposing or replacing the reader aborts unfinished work.

### Presentation and reading interaction

`core/presentation/rendition/` turns publication metadata, content hints, preferences, and viewport metrics into an explicit rendering plan. `core/presentation/renderer/` executes reflowable, vertical-writing, fixed-layout, and spread plans inside isolated, script-disabled documents. Renderers report layout state but do not own product UI.

`core/interaction/` owns locators, publication-progress conversion, navigation, input routing, and selection. React controls display progress but do not define how a publication percentage maps back to a spine item and section progression. Presentation and interaction are collaborating peers: renderers resolve and capture locators, while navigation drives renderer contracts. Neither is modeled as a false one-way abstraction over the other.

Pagination is CSS fragmentation in both writing modes: the reader gives the content document a multicol fragmentainer the size of one page and reads the resulting geometry back, rather than computing page boundaries arithmetically. This matters because an arithmetic boundary at `index * pageSize` bears no relation to where line boxes actually fall and will bisect whichever line sits on it, whereas a fragmentation break lands between line boxes by construction. The two modes differ only in which physical axis the column boxes advance along — X for `horizontal-tb`, Y for vertical writing, since multicol places columns along the container's inline axis — so vertical pagination scrolls Y and horizontal pagination scrolls X.

### Reading features and validation

`core/features/` contains optional reading capabilities such as search, annotations, decorations, media inspection, and accessibility descriptions. `core/validation/` contains reusable corpus and conformance reporting code. The stable public surface remains `core/index.ts`, so internal grouping does not leak into React or host integrations.

Search parses a chapter only long enough to create a pure-data text and locator index; cached entries contain CFI paths, DOM paths, text offsets, and diagnostics, never `Document` or `Text` nodes. A count-and-byte-budgeted LRU favours the current spine item and its neighbours. Query cancellation does not discard shared index work needed by a newer query, while explicit cache clearing and reader disposal abort pending builds and release all completed indexes.

Rendering has a separate publication-scoped content-document cache. It retains frozen serialized markup, presentation hints, and diagnostics so a recent chapter revisit does not repeat archive reading, parsing, resource rewriting, or serialization. It never retains a live `Document`, iframe, or renderer instance. Count and approximate-byte limits bound markup memory, while generated and rewritten object URLs remain under `PublicationResourceSession` ownership and are revoked once, after renderers and the content cache are disposed.

### Module boundaries

Host and showcase code consume the React adapter through `react/index.ts`, and React consumes the engine through `core/index.ts`. Core code never depends on React or the showcase. Within the core, each focused leaf module may expose its own `index.ts` for peer modules, while files inside that leaf may use direct sibling imports. The organizational group directories intentionally do not add aggregate barrels: keeping those categories non-public avoids export collisions and barrel-induced dependency cycles.

Large UI surfaces may keep private implementation folders next to their public component. For example, `panels/settings/` contains the advanced settings view and visual previews used only by `EpubSettingsPanel`; those helpers are not part of the React public API. `npm run boundaries:check` enforces the cross-layer rules, and both verification commands run it before type checking and tests.

### Styling

`styles.css` is the ordered stylesheet entry point. Shared tokens, the showcase, reader shell, and immersive mode stay independent, while `styles/ui/` separates transient overlays, panel foundations, reader tools, settings, keyboard help, and responsive overrides. Import order is intentional because it preserves the reader UI cascade.

## State and lifecycle

The reader publishes immutable snapshots containing lifecycle status, publication data, renderer state, locator, preferences, diagnostics, search state, marks, and selection. Engine operations are serialized through the reader and renderer transaction boundaries. Input captured inside publication documents may request a host command such as opening search or toggling chrome; React owns the product action. Navigation boundaries, bookmarks, footnotes, selection, marks, and images are reported separately as semantic reader events.

Reading-session data and its persistence port belong to the core runtime; the default `localStorage` implementation belongs to the React/browser adapter and remains replaceable. EPUB bytes remain host-owned and are never persisted or uploaded by the reader. During development, persisted sessions are disposable: the loader accepts only the exact current schema and rejects older or partially valid records instead of migrating them.

External-link safety has one authority: the core navigation layer approves only HTTP(S), `mailto`, and `tel` destinations and passes a typed target to the host. React formats that approved target and owns confirmation UI, but cannot widen the engine protocol policy accidentally.
