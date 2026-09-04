# Adaptive Cursor Outline

A custom cursor that expands into the outline of interactive descendants.

## Usage

```tsx
import { AdaptiveCursorOutline } from './adaptive-cursor-outline'

<AdaptiveCursorOutline color="#e6ff69" padding={8}>
  <button>Regular target</button>
  <button data-cursor-path="M...Z">Irregular target</button>
</AdaptiveCursorOutline>
```

## Props

- `selector` controls which descendants are detected.
- `color`, `padding`, `duration`, `strokeWidth`, and `cursorSize` control the frame.
- `data-cursor-path` accepts a normalized `0 0 100 100` SVG path for irregular targets.
- `className` applies to the wrapper.

## Notes

- Keyboard focus triggers the same outline.
- Touch-only devices keep their native cursor behavior and do not receive the primary effect.
- Reduced-motion mode disables geometry interpolation.
