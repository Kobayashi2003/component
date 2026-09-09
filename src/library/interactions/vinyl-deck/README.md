# Vinyl Deck

An SVG audio deck with track selection, platter dragging, playback controls, local-file queues, shuffle, and automatic advance.

## Usage

```tsx
import { VinylDeck } from './vinyl-deck'

;<VinylDeck
  items={[
    {
      id: '01',
      title: 'Blue Static',
      genre: 'Breakcore',
      release: '2026',
      author: 'Afterimage',
      caption: 'Noise becomes rhythm.',
      cover: '/cover.jpg',
      audio: '/track.mp3',
    },
  ]}
  backgroundControls
/>
```

## Props

- `items` is required. An item contains track metadata plus optional `cover`, `audio`, color, BPM, and format fields.
- `source` accepts a URL string, `URL`, `Blob`, `File`, or `MediaStream` and overrides the active item audio.
- `initialIndex` defaults to 0. `autoPlay`, `loop`, and `muted` default to false.
- `volume` / `defaultVolume` (64, 0–100), `shuffle` / `defaultShuffle` (false), `autoAdvance` / `defaultAutoAdvance` (false), and `shadowAngle` / `defaultShadowAngle` (90°) support controlled values with matching change callbacks.
- `showBackground` defaults to true; `backgroundControls` defaults to false. `audioRef` exposes the underlying audio element.
- `onChange`, `onTimeUpdate`, `onAudioFilesChange`, and `onError` expose navigation and media state.

## Notes

- Remote audio requires CORS permission for spectrum analysis.
- The optional file control reads MP3 and FLAC metadata and replaces the temporary local queue.
- `VinylTurntable` and `VinylDeckBackground` are available as separate exports. `FocusDeck` is a compatibility alias.
