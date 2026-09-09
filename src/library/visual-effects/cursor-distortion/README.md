# Cursor Distortion

A pointer lens that distorts canvas artwork. DOM children are static overlays, not distortion targets.

## Usage

```tsx
import { CursorDistortion } from './cursor-distortion'

;<CursorDistortion
  style={{ height: 360 }}
  drawSource={({ context, width, height }) => {
    context.fillStyle = '#eee'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#111'
    context.font = '48px sans-serif'
    context.fillText('Hello', 40, height / 2)
  }}
/>
```

## Parameters

| Parameter             | Default           | Purpose                                                         |
| --------------------- | ----------------- | --------------------------------------------------------------- |
| `drawSource`          | required callback | Paints the source texture; called on resize or callback change. |
| `children`            | —                 | Static overlay or fallback content.                             |
| `radius`              | `125` px          | Lens radius, minimum 48 px.                                     |
| `magnification`       | `0.2`             | Magnification amount, 0–0.45.                                   |
| `distortion`          | `0.016`           | UV warp, 0–0.05.                                                |
| `chromaticAberration` | `0.007`           | RGB separation, 0–0.025.                                        |
| `smoothing`           | `0.2`             | Follow factor, 0.01–1; larger is faster.                        |
| `className`, `style`  | —                 | Applied to the tracking container; set its layout here.         |
| `disabled`            | `false`           | Turns off the effect without disabling child controls.          |

## Notes

Give the container a height. Memoize `drawSource` with `useCallback` when updating other props. Requires WebGL; provide children for a no-WebGL fallback. Touch keeps the artwork static; reduced motion removes pointer easing.
