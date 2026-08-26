# Analog Video Distortion

A damaged-tape and CRT effect wrapper for arbitrary React content.

## Usage

```tsx
import { AnalogVideoEffect } from './analog-video-distortion'

<AnalogVideoEffect noise={0.15} tearing={0.7} smear={0.6}>
  <PageContent />
</AnalogVideoEffect>
```

## Props

- `noise`, `tearing`, `smear`, `scanlines`, and `colorShift` accept values from `0` to `1`.
- `className` applies to the wrapper.

## Notes

- The effect uses DOM slices and Canvas 2D; canvas rendering pauses while hidden.
- Reduced-motion mode lowers the refresh rate and suppresses strong faults.
