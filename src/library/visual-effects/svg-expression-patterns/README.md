# SVG Expression Patterns

A compact selector for six hand-drawn expression studies stored as local SVG assets.

## Usage

```tsx
import { SvgExpressionPatterns } from './svg-expression-patterns'

<SvgExpressionPatterns />
```

## Interaction

- Choose a thumbnail to crossfade the main preview.
- Use the up and down arrow keys while a selector is focused to move through the set.

## Notes

- SVGs are loaded as image assets instead of injected markup, keeping the DOM small and avoiding duplicate SVG IDs.
- Reduced-motion mode disables the crossfade and selection transitions.
- The assets use different path topologies, so the demo crossfades rather than attempting an unreliable path morph.
