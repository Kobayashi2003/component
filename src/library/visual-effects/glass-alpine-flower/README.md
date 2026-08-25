# Glass Alpine Flower

An interactive WebGL2 relighting experiment built from a neutral glass-flower texture, normal map, and specular map. Two draggable colored lights drive diffuse, specular, Fresnel, and transmission responses without baking blue or purple into the base material.

## Usage

```tsx
import { GlassAlpineFlower } from './GlassAlpineFlower'

<GlassAlpineFlower />
```

## Interaction

- Drag the blue and purple handles to move each light across the flower.
- Collapse the control panel when you want an unobstructed view, then expand it without losing state.
- Tune radius, intensity, surface normal strength, specular response, Fresnel rim, shininess, transmission, and exposure.
- Switch between the final result, base texture, normal map, and lighting-only debug views.
- Use Reset to restore the original lights, shader values, and final render mode.

## Composition

- `GlassAlpineFlower` owns interaction state and composes the demo.
- `GlassFlowerControls` renders the debug selector, parameter sliders, readouts, and reset action.
- `useGlassFlowerRenderer` connects React state and texture loading to the renderer lifecycle.
- `GlassFlowerWebGLRenderer` owns WebGL resources and draws only when input or size changes.
- `model.ts` centralizes public types, defaults, control definitions, and shader-value conversion.
- `shaders.ts` keeps GLSL source separate from renderer lifecycle code.

## Notes

- Requires WebGL2 and `ResizeObserver` support.
- Canvas resolution follows its rendered size and caps device pixel ratio at `2`.
- Texture loading is asynchronous and safe to abandon when the component unmounts.
- GPU textures, geometry, program state, observers, and pending frames are released on teardown.
