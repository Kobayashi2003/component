# Analog Video Distortion

A reusable damaged-tape and CRT signal layer for React content. It combines randomized horizontal tearing, directional smear, green-biased noise, tracking bands, light color ghosting, thin scanlines, and a vignette.

## Usage

```tsx
<AnalogVideoEffect
  noise={0.15}
  tearing={0.7}
  smear={0.6}
  scanlines={0.25}
  colorShift={0.4}
>
  <PageContent />
</AnalogVideoEffect>
```

Values are clamped between `0` and `1`.

## Notes

- DOM slices create content tearing; Canvas 2D renders noise, signal lines, and smear.
- Fault timing, position, direction, and strength are randomized with stable intervals between events.
- Canvas sizing follows `ResizeObserver` and capped device pixel ratio. Rendering pauses while hidden.
- Reduced-motion mode lowers noise refresh and suppresses strong faults.
