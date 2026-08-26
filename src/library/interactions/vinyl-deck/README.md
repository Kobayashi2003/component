# Vinyl Deck

An SVG audio deck with track selection, platter dragging, playback controls, local-file queues, shuffle, and automatic advance.

## Usage

```tsx
import { VinylDeck } from './vinyl-deck'

<VinylDeck
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
- Playback, volume, shuffle, auto-advance, and shadow angle support controlled values, default values, and change callbacks.
- `onChange`, `onTimeUpdate`, `onAudioFilesChange`, and `onError` expose navigation and media state.

## Notes

- Remote audio requires CORS permission for spectrum analysis.
- The optional file control reads MP3 and FLAC metadata and replaces the temporary local queue.
- `VinylTurntable` and `VinylDeckBackground` are available as separate exports. `FocusDeck` is a compatibility alias.
