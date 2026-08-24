# Retro Radio

A presentation-focused vintage receiver adapted from a larger radio-themed interface. The component concentrates on the cabinet, controls, CRT screen, antenna, light, and channel-selection metaphor.

## Usage

```tsx
<RetroRadio
  stations={[
    {
      id: "01",
      name: "暖 · 温和圆融",
      frequency: "88.6",
      glyph: "暖",
      angle: -46,
    },
    {
      id: "02",
      name: "直 · 直接坦率",
      frequency: "101.3",
      glyph: "直",
      angle: 0,
    },
  ]}
/>
```

Use the compact **Load audio / Select** control to choose a local music file. As in `vinyl-deck`, the file stays in the browser and is exposed through an object URL rather than uploaded to a server. Selecting a file starts playback; clicking the volume knob pauses or resumes the real audio stream, while dragging it (or using the arrow keys) adjusts the connected gain node.

Click or drag the tuning knob to change stations. Both knobs accumulate incremental angular movement, pause outside their active ring, and rebase when the pointer returns. The antenna can be rotated and extended directly.

The migrated motion system includes cabinet arrival and station-change recoil, four CRT views (mode, volume, playback, and spectrum), angular knob damping and tuning detents, antenna segments, transparent tip glow, and intermittent sparks. The spectrum is painted from the source project's Web Audio `AnalyserNode` pipeline, so it responds to the selected music instead of running a decorative CSS animation. The cabinet, speaker cloth, CRT typography, segmented volume meter, bezel, feet, and knob hardware follow the source project; the cursor-following room light has intentionally been omitted. Reduced-motion preferences disable continuous and staged animation.

`RetroRadioBackground` is exported separately, and callbacks expose station, volume, playback, and selected-music changes.
