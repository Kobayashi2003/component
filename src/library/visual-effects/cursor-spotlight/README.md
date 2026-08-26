# Cursor Spotlight

A diffused pointer light for dark surfaces and coordinated depth effects.

## Usage

```tsx
import { CursorSpotlight } from './cursor-spotlight'

<CursorSpotlight radius={320} intensity={28} softness={72}>
  <Surface />
</CursorSpotlight>
```

## Props

- `color`, `radius`, `intensity`, `softness`, `smoothing`, and `shadowDistance` control the light.
- `className` applies to the wrapper.

## CSS variables

Descendants can use `--spotlight-nx`, `--spotlight-ny`, `--spotlight-shadow-x`, `--spotlight-shadow-y`, and `--spotlight-shadow-blur` for coordinated transforms and shadows.

## Notes

- Touch input is ignored because the effect depends on continuous pointer position.
- Reduced-motion mode removes opacity transitions.
