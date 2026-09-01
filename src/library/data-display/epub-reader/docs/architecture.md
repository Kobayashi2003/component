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

`react/` contains the external store, hooks, context, panels, and reader shell. `ReactEpubReaderStore` owns asynchronous open/replace/dispose races and viewport observation. The UI subscribes to immutable snapshots and invokes reader commands; it does not manipulate publication documents directly.

### Reader orchestration

`core/runtime/reader/` composes the engine. `BrowserEpubReader` coordinates the active renderer, navigation history, locators, search, marks, selection, media activation, input routing, diagnostics, and preferences. This layer is the public browser-facing boundary for the core.

### EPUB format processing

`core/epub/` owns format-specific work. Its `archive/` and `publication/` modules read the OCF container and convert package/navigation documents into a normalized publication model. `content/`, `resources/`, `text/`, and `xml/` preflight and materialize spine documents while keeping temporary URLs and compatibility repairs explicit.

### Presentation and reading interaction

`core/presentation/rendition/` turns publication metadata, content hints, preferences, and viewport metrics into an explicit rendering plan. `core/presentation/renderer/` executes reflowable, vertical-writing, fixed-layout, and spread plans inside isolated, script-disabled documents. Renderers report layout state but do not own product UI.

`core/interaction/` owns locators, navigation, input routing, and selection. Presentation and interaction are collaborating peers: renderers resolve and capture locators, while navigation drives renderer contracts. Neither is modeled as a false one-way abstraction over the other.

Pagination is CSS fragmentation in both writing modes: the reader gives the content document a multicol fragmentainer the size of one page and reads the resulting geometry back, rather than computing page boundaries arithmetically. This matters because an arithmetic boundary at `index * pageSize` bears no relation to where line boxes actually fall and will bisect whichever line sits on it, whereas a fragmentation break lands between line boxes by construction. The two modes differ only in which physical axis the column boxes advance along — X for `horizontal-tb`, Y for vertical writing, since multicol places columns along the container's inline axis — so vertical pagination scrolls Y and horizontal pagination scrolls X.

### Reading features and validation

`core/features/` contains optional reading capabilities such as search, annotations, decorations, media inspection, and accessibility descriptions. `core/validation/` contains reusable corpus and conformance reporting code. The stable public surface remains `core/index.ts`, so internal grouping does not leak into React or host integrations.

## State and lifecycle

The reader publishes immutable snapshots containing lifecycle status, publication data, renderer state, locator, preferences, diagnostics, search state, marks, and selection. Commands are serialized through the reader and renderer transaction boundaries. Resource URLs, observers, event routers, and renderer documents are released when the reader is replaced or disposed.

Reading-session persistence belongs to the React adapter and is injectable. EPUB bytes remain host-owned and are never persisted or uploaded by the reader.
