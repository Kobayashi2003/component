# Controlled Reader Extensions

The reader exposes one host composition entry, `configureReaderExtensions`, but it does not expose a generic plugin pipeline. Every contribution belongs to a typed bucket with a fixed input, output, execution phase, and authority boundary.

```ts
import { configureReaderExtensions, type BrowserEpubReaderOptions } from '../core';

const extensions = configureReaderExtensions({
  compatibilityModules: [myContentCompatibilityRule],
  inputBindings: [myKeyboardBinding],
  themes: [myTheme],
});

const options = { extensions } satisfies BrowserEpubReaderOptions;
```

A complete, TypeScript-checked example is available in [`examples/reader-extensions.ts`](../examples/reader-extensions.ts).

## Contribution types

### EPUB compatibility modules

Compatibility modules adapt authored EPUB content. They run only at one declared publication, content-document, resource, or rendition stage. They cannot bypass archive/path limits, replace the parser or renderer, retain live documents, or alter application persistence schemas.

The configuration combines contributed modules with all built-ins and rejects duplicate IDs, invalid stages, cross-stage dependencies, and unresolved dependencies. A module with `enabledByDefault: true` enters the immutable Compatibility Profile for each newly opened publication. The profile identity participates in relevant cache keys.

### Input bindings

Input bindings receive normalized keyboard, wheel, page-click, or swipe values and immutable reader state. They may return only a closed `ReaderCommand`; they never receive DOM events, elements, renderers, or navigation services.

Bindings run by descending priority. Built-ins use priority `0`, so a deliberate override should use a positive priority. An invalid command or thrown error is isolated and resolution continues. Shortcut descriptions are included in the Reader Snapshot and become the React keyboard-help content.

### Themes

Themes contribute publication colors, a preview, and an optional closed set of host-UI color tokens. Registration rejects duplicate IDs, declaration-breaking values, and network-backed `url(...)` values. It cannot add selectors, arbitrary properties, layout rules, or component code.

The configured catalog is copied into each reader session. A host may also call `reader.registerTheme()` after opening; that registration belongs only to the active reader and republishes its snapshot.

## Lifecycle

- Create and reuse one configuration at application composition time.
- Pass it as `BrowserEpubReaderOptions.extensions` or `EpubReader`'s `readerOptions.extensions`.
- Compatibility and input configuration is fixed for one opened reading session; reopen the publication to use a different configuration.
- Reader-owned resources, listeners, temporary URLs, caches, and renderers still follow the fixed Kernel lifecycle.

Publication-scoped peer Features, Capabilities, and Observers remain internal mechanisms. They will not become public until their restricted host context and persisted-state ownership are wired end to end. Supplying a generic lifecycle module today would expose an unstable internal composition boundary.
