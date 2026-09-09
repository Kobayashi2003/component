# Semantic Drag Cursor

Changes a decorative cursor according to the hovered element’s action. It does not implement dragging, navigation or playback.

## Usage

```tsx
import { SemanticDragCursor } from './semantic-drag-cursor'

;<SemanticDragCursor style={{ padding: 60 }}>
  <a href="/work" data-cursor="link">
    Open work
  </a>
  <div data-cursor="drag">Your draggable content</div>
</SemanticDragCursor>
```

## Parameters

| Parameter            | Default         | Purpose                                                 |
| -------------------- | --------------- | ------------------------------------------------------- |
| `children`           | required        | Content within the tracking area.                       |
| `selector`           | `[data-cursor]` | Finds semantic targets.                                 |
| `color`              | `#dfff42`       | CSS cursor color.                                       |
| `smoothing`          | `0.24`          | Follow factor, 0.01–1; larger is faster.                |
| `className`, `style` | —               | Applied to the tracking container; set its layout here. |
| `disabled`           | `false`         | Turns off the effect without disabling child controls.  |

## Notes

`data-cursor` accepts `default`, `link`, `drag`, `view`, `play`. `data-cursor-label` customizes labels except the built-in drag arrows/HOLD label. Implement the actual interaction yourself. Touch retains native interaction; reduced motion removes pointer easing.
