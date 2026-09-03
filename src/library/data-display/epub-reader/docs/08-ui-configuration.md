# 08 · UI configuration

`configureReaderUi()` is the React composition entry. It validates Shell settings and delegates themes, Input Bindings, and EPUB Compatibility Modules to the existing Core registries; React does not maintain parallel catalogs.

```tsx
import { configureReaderUi, EpubReader } from '../react'

const configuration = configureReaderUi({
  themes: [productTheme],
  inputBindings: [vimNavigation],
  layout: {
    compactBreakpointPx: 640,
    panelWidthPx: 420,
  },
  appearance: {
    density: 'compact',
    motion: 'system',
  },
  messages: {
    reading: 'Now reading',
    sectionPosition: (section, total) => `${section}/${total}`,
  },
  tools: [readingStatisticsTool],
  surfaceRenderers: [productFootnoteRenderer],
})

<EpubReader source={book} configuration={configuration} />
```

Create the configuration outside render or memoize it. Core contributions are fixed when the publication opens. Messages, density, motion, layout, tool availability, and Surface Renderer selection are consumed by the Shell while rendering.

## Closed Shell settings

- `messages` replaces individual static or dynamic user-facing strings.
- `layout.compactBreakpointPx` controls both responsive React semantics and compact CSS presentation.
- `layout.panelWidthPx` bounds the desktop side panel.
- `appearance.density` selects comfortable or compact Shell spacing.
- `appearance.motion` follows system motion or forces reduced motion.

Unknown fields, unsafe dimensions, unsupported enum values, empty messages, and invalid representative results from dynamic message functions are rejected while composing the configuration. Configuration is intentionally not an arbitrary CSS or render-slot bag.

## Tools and surfaces

A Tool Module adds a peer panel feature in the `navigation`, `primary`, or `secondary` toolbar region. The Shell retains its panel wrapper, responsive dialog behavior, focus restoration, Escape handling, close control, and error containment.

A Surface Renderer provides content for one existing semantic transient surface. Its context includes the committed surface, public reader handle, close action, and feedback action. Selection content additionally receives the bounded mode and saved-feedback actions it needs. It never receives raw DOM events or Shell internals.

See [Controlled extensions](./07-controlled-extensions.md) for registration rules and [`examples/reader-extensions.ts`](../examples/reader-extensions.ts) for compilable definitions.
