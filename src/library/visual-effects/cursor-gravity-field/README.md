# Cursor Gravity Field

A proximity field that makes many interface elements react to the pointer as a shared source of gravity.

## Usage

```tsx
import { CursorGravityField } from './cursor-gravity-field'
;<CursorGravityField radius={210} strength={0.32}>
  <button data-cursor-gravity>Alpha</button>
  <article data-cursor-gravity>Card</article>
</CursorGravityField>
```

## Props

- `selector` chooses affected descendants and defaults to `[data-cursor-gravity]`.
- `radius` defines the area of influence around the pointer.
- `strength` controls attraction; negative values create repulsion.
- `maxDisplacement` caps travel so elements remain usable, and `smoothing` controls follow speed.
- `className` applies to the wrapper.

## Notes

- Each affected element keeps its own layout position; motion uses the independent CSS `translate` property.
- Dynamic descendants are detected automatically.
- Touch input and reduced-motion mode keep elements at rest.
