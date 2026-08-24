# Cursor Spotlight

A smoothed, diffused cursor light for dark surfaces.

## Usage

```tsx
<CursorSpotlight
  radius={320}
  intensity={28}
  softness={72}
  smoothing={0.14}
  shadowDistance={52}
>
  <Surface />
</CursorSpotlight>
```

`color`, `radius`, `intensity`, `softness`, `smoothing`, and `shadowDistance` control the light without coupling it to the demo surface. The overlay supplies the visible highlight; descendants can consume `--spotlight-nx`, `--spotlight-ny`, `--spotlight-shadow-x`, `--spotlight-shadow-y`, and `--spotlight-shadow-blur` for coordinated tilt and opposite-direction cast shadows. Position updates are interpolated in animation frames; touch is ignored and reduced motion removes opacity transitions.
