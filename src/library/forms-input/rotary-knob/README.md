# Rotary Knob

A rotary numeric input with adjustable drag resistance and detents, in graphite, ivory and orange finishes.

## Usage

```tsx
import { RotaryKnob } from './rotary-knob'
;<RotaryKnob label="Gain" defaultValue={50} damping={0.35} detentStep={10} detentStrength={0.6} />
```

## API

- `label` is the accessible name; `unit` defaults to `%`.
- `value` / `onChange` support controlled input; `defaultValue` defaults to 50 for uncontrolled input.
- `min`, `max`, `step` default to 0, 100, 1. Values clamp to the range and round to steps anchored at min; max remains reachable. Use detent spacing divisible by step for exact notches.
- `damping`: 0–1, default 0.35. Maximum damping requires four times the drag travel.
- `detentStep`: notch spacing in value units, default 10; 0 disables notches.
- `detentStrength`: 0–1, default 0.6; 0 is smooth, 1 fully indexed.
- `appearance`: `graphite`, `ivory`, or `signal`.
- `disabled`: prevents input; zero-width ranges also disable input.

## Notes

Drag around the rim. Arrow keys adjust a step, Page Up/Down ten steps, Home/End reach the bounds. Touch dragging suppresses scrolling only on the knob. Reduced motion removes settling animation. Detents simulate input resistance, not hardware vibration.
