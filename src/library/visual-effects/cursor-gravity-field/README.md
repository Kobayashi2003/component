# Cursor Gravity Field

Moves selected DOM elements toward the pointer. Wrapping content defines the tracking area; only matching targets move.

## Usage

```tsx
import { CursorGravityField } from './cursor-gravity-field'

;<CursorGravityField style={{ padding: 80 }}>
  <button data-cursor-gravity>Move me</button>
  <span>I stay still</span>
</CursorGravityField>
```

## Parameters

| Parameter            | Default                 | Purpose                                                              |
| -------------------- | ----------------------- | -------------------------------------------------------------------- |
| `children`           | required                | Content within the tracking area.                                    |
| `selector`           | `[data-cursor-gravity]` | CSS selector for moving targets; custom selectors need no extra CSS. |
| `radius`             | `210` px                | Attraction radius, minimum 40 px.                                    |
| `strength`           | `0.32`                  | −1–1; negative repels.                                               |
| `maxDisplacement`    | `46` px                 | Maximum travel on each axis.                                         |
| `smoothing`          | `0.16`                  | Follow factor, 0.01–1; larger is faster.                             |
| `className`, `style` | —                       | Applied to the tracking container; set its layout here.              |
| `disabled`           | `false`                 | Turns off the effect without disabling child controls.               |

## Notes

The effect owns target `translate` while attached; wrap elements whose translate is already animated. Target styles are removed on deselection or unmount. Touch and reduced motion keep targets at rest.
