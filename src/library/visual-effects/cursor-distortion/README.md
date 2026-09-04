# Cursor Distortion Lens

A WebGL cursor lens that combines magnification, UV refraction, distortion, and RGB channel separation.

## Usage

```tsx
import { CursorDistortion } from './cursor-distortion'
;<CursorDistortion
  drawSource={({ context, width, height }) => {
    context.fillText('DESIGN', width / 2, height / 2)
  }}
  radius={125}
  magnification={0.2}
/>
```

## Props

- `drawSource` paints the source texture into a 2D canvas before it is uploaded to WebGL.
- `radius` and `magnification` define the optical lens.
- `distortion` controls the fragment shader's UV ripple.
- `chromaticAberration` offsets the red and blue texture samples in opposite directions.
- `smoothing` controls pointer interpolation; `children` may contain controls and static fallback content.

## Notes

- The shader runs in native WebGL with no Three.js dependency.
- Redraws occur on resize and whenever the source callback changes.
- Without WebGL, the canvas is hidden and `children` become the fallback surface.
- Touch input keeps the source artwork undistorted, and reduced-motion mode removes pointer interpolation.
