# Adaptive Cursor Outline

A decorative pointer outline that fits interactive targets and follows keyboard focus.

## Usage

```tsx
import { AdaptiveCursorOutline } from './adaptive-cursor-outline'

;<AdaptiveCursorOutline style={{ padding: 60 }}>
  <button>Automatic target</button>
  <article data-cursor-focus>Extra target</article>
</AdaptiveCursorOutline>
```

## Parameters

| Parameter                   | Default                                      | Purpose                                                           |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `children`                  | required                                     | Content within the tracking area.                                 |
| `selector`                  | interactive elements + `[data-cursor-focus]` | Matches buttons, links, inputs, selects and textareas by default. |
| `color`                     | `#e6ff69`                                    | CSS outline color.                                                |
| `padding`                   | `8` px                                       | Space around the target.                                          |
| `duration`                  | `260` ms                                     | Morph duration.                                                   |
| `strokeWidth`, `cursorSize` | `1.5`, `10` px                               | Outline width and resting dot size.                               |
| `className`, `style`        | —                                            | Applied to the tracking container; set its layout here.           |
| `disabled`                  | `false`                                      | Turns off the effect without disabling child controls.            |

## Notes

Use `data-cursor-path` with an SVG path in a 0–100 coordinate space for irregular outlines. This is visual feedback, not keyboard semantics: custom targets still need their own accessible interaction. Touch does not get a hover cursor; reduced motion removes morph transitions.
