# Geometry Light Lab

A compact Canvas/WebGL2 study of 3D geometry and real-time light response.

## Usage

```tsx
import { GeometryLightLab } from './geometry-light-lab'

<GeometryLightLab />
```

## Controls

- Choose a sphere, cube, or torus; adjust size, rotation, and material response.
- Drag the canvas to rotate X/Y in view space; use the Z slider for precise roll.
- Add up to five lights, then drag, recolor, and tune each one.
- Use Render channel to inspect normals, diffuse light, or specular light.

## Notes

- Geometry is ray-marched from signed-distance fields; no model or texture assets are used.
- Requires WebGL2 and `ResizeObserver`.
