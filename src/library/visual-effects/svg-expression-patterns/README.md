# SVG Expression Patterns

Six hand-drawn SVG expression states with feature-level path morphing.

## Usage

```tsx
import { SvgExpressionPatterns } from './svg-expression-patterns'

<SvgExpressionPatterns />
```

## Interaction

- Choose a thumbnail to switch expressions with a pattern-specific transition.
- Use the arrow keys, Home, or End while a selector is focused to move through the set.

## Notes

- The original SVG assets stay untouched and remain the final visual states.
- A normalized morph layer interpolates matching eye, upper-arc, and mouth silhouettes during transitions.
- Reduced-motion mode switches states without animated transforms or morphing.
