# 07 · Controlled extensions

The reader exposes typed extension buckets, not a generic plugin pipeline. Every contribution has a fixed phase, input, output, authority boundary, validation rule, and owner.

```ts
import { configureReaderExtensions, type BrowserEpubReaderOptions } from '../core'

const extensions = configureReaderExtensions({
  compatibilityModules: [myContentCompatibilityRule],
  inputBindings: [myKeyboardBinding],
  themes: [myTheme],
})

const options = { extensions } satisfies BrowserEpubReaderOptions
```

The complete checked example is [`examples/reader-extensions.ts`](../examples/reader-extensions.ts).

## Implemented contribution types

| Contribution | Composition | Authority retained by reader |
| --- | --- | --- |
| Compatibility Module | ordered, phase-specific book adaptation | archive safety, parser and renderer transactions |
| Input Binding | priority-ordered normalized signal mapping | DOM listeners, gestures, commands, navigation |
| Theme | validated catalog entry | allowed tokens and publication style application |
| React Tool Module | peer toolbar entry and panel body | placement, panel frame, focus, exclusivity, errors |
| Surface Renderer | one provider for one semantic surface | wrapper, role, dismissal, isolation and link policy |

### Compatibility Modules

Modules run at one publication, content-document, resource, or rendition stage. Built-ins remain enabled unless their current-publication preferences disable them. Configuration rejects duplicate IDs, invalid stages, cross-stage dependencies, and unresolved same-stage dependencies.

### Input Bindings

Bindings run in descending priority. Built-ins use priority `0`; a deliberate host override uses a positive priority. Exceptions and invalid commands are isolated and resolution continues.

### Themes

Themes contribute publication colors, preview values, and an optional closed host-UI palette. Validation rejects duplicate IDs, declaration-breaking values, and network-backed URLs. Themes cannot add arbitrary selectors, properties, layout rules, or component code.

### Tool Modules

A descriptor supplies a stable ID, text, one fixed toolbar region, availability, icon, and panel renderer. Contributions are appended after built-ins. They cannot replace built-in IDs or commands, register arbitrary commands, access Shell internals, or inject deep slots. Optional tool failures are contained without unmounting the reading viewport.

### Surface Renderers

One provider may replace the content of `footnote`, `selection`, `mark`, `image`, or `external-link`. Providers are not chained and do not intercept the event that opened the surface. External-link content remains inside the fixed policy-approved confirmation frame.

## Lifecycle

Create and reuse configuration at application composition time. The configured Compatibility Modules, Input Bindings, and Theme Catalog are copied into a reader when the publication opens; changing application configuration takes effect on the next open. `reader.registerTheme()` is the explicit exception for adding a theme to the active reader. Reader-owned listeners, temporary URLs, caches, documents, and renderers always follow the Kernel lifecycle.

Feature, Capability, Provider, and Observer primitives remain internal. A future public plugin SDK should expose them only after capability declarations, version checks, state ownership, diagnostics, and disposal are specified end to end. The decisions are recorded in [ADR 0001](./adr/0001-controlled-reader-extension-boundaries.md) and [ADR 0002](./adr/0002-controlled-react-ui-composition.md).
