# Glass Alpine Flower

An interactive WebGL2 glass-flower relighting effect with two draggable lights and adjustable material response.

## Usage

```tsx
import { GlassAlpineFlower } from './glass-alpine-flower'

<GlassAlpineFlower />
```

The built-in controls adjust light radius and intensity, normal strength, reflection, Fresnel response, shininess, transmission, exposure, and debug view.

## Notes

- Requires WebGL2 and `ResizeObserver`.
- The bundled base, normal, and specular textures must remain available to the build pipeline.
- Canvas resolution follows its rendered size and caps device pixel ratio at `2`.
