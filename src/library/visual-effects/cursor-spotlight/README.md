# Cursor Spotlight

A pointer-following light over DOM content. Mark objects explicitly to give them a moving shadow.

## Usage

```tsx
import { CursorSpotlight } from './cursor-spotlight'

;<CursorSpotlight style={{ padding: 60, background: '#30383e' }}>
  <button data-spotlight-shadow>Lit surface</button>
</CursorSpotlight>
```

## Parameters

| Parameter               | Default    | Purpose                                                 |
| ----------------------- | ---------- | ------------------------------------------------------- |
| `children`              | required   | Content beneath the light overlay.                      |
| `color`                 | `#d8efff`  | CSS light color.                                        |
| `radius`                | `300` px   | Light radius.                                           |
| `intensity`, `softness` | `32`, `68` | Percentages, 0–100.                                     |
| `smoothing`             | `0.16`     | Follow factor, 0.01–1; larger is faster.                |
| `shadowDistance`        | `52` px    | Shadow displacement scale.                              |
| `className`, `style`    | —          | Applied to the tracking container; set its layout here. |
| `disabled`              | `false`    | Turns off the effect without disabling child controls.  |

## Notes

`data-spotlight-shadow` supplies a ready-to-use box shadow and replaces the target’s box-shadow. For custom shadow composition use `--spotlight-shadow-x`, `--spotlight-shadow-y`, and `--spotlight-shadow-blur`; normalized position is available as `--spotlight-nx/ny`. Light is clearest on dark surfaces. Touch has no following light; reduced motion removes easing.
