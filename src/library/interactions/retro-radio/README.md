# Retro Radio

A vintage audio player with station tuning, volume control, local-file playback, and analyser-driven CRT feedback.

## Usage

```tsx
import { RetroRadio } from './retro-radio'

<RetroRadio
  stations={[
    { id: '01', name: 'Warm', frequency: '88.6', glyph: 'W', angle: -46 },
    { id: '02', name: 'Direct', frequency: '101.3', glyph: 'D', angle: 0 },
  ]}
  onStationChange={(station) => console.log(station)}
/>
```

## Props

- `stations` is required. Each station needs `id`, `name`, `frequency`, and `glyph`; `angle` is optional and overrides the computed dial position.
- `initialIndex`, `defaultVolume`, and `showBackground` set the initial presentation.
- `onStationChange`, `onVolumeChange`, `onPlaybackChange`, and `onMusicChange` expose user changes.

## Notes

- Selected audio files stay in the browser and are not uploaded.
- Tuning, volume, and antenna controls support pointer input; the main controls also support keyboard input.
- `RetroRadioBackground` is available as a separate export.
