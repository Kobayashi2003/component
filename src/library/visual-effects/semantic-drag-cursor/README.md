# Semantic Drag Cursor

A context-aware cursor that combines semantic hover feedback with a directional drag affordance.

## Usage

```tsx
import { SemanticDragCursor } from './semantic-drag-cursor'
;<SemanticDragCursor>
  <a data-cursor="link" href="/work">
    Project
  </a>
  <figure data-cursor="view">...</figure>
  <div data-cursor="drag">...</div>
</SemanticDragCursor>
```

## Semantic states

- `default` renders an 8px dot.
- `link` renders a compact circular arrow, or a custom action label.
- `view` and `play` render labeled circular cursors.
- `drag` renders a directional capsule and switches to a compact grab state while pressed.
- `data-cursor-label` overrides any state's default label, for example `OPEN`.

## Props

- `selector` changes how semantic targets are discovered and defaults to `[data-cursor]`.
- `color` controls the cursor surface.
- `smoothing` controls pointer follow speed.
- `dragStretch` controls velocity-based cursor elongation.

## Notes

- The component supplies feedback only; draggable descendants retain control of their own data and scroll behavior.
- Keyboard and touch interactions remain native because the custom cursor is decorative.
- Reduced-motion mode removes follow interpolation and velocity stretching.
