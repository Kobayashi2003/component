# Vinyl Deck

An industrial SVG turntable with real audio playback, inertial motion, and stepped hardware controls. Playback starts paused; the record rings and cover share one rotor and accelerate or decelerate together.

## Usage

```tsx
<VinylDeck
  items={[{ ...track, cover: '/cover.jpg', audio: '/track.mp3' }]}
  backgroundControls
/>
```

`source` accepts a URL string, `URL`, `Blob`/`File`, or `MediaStream` and overrides the active track audio. The background file control accepts multiple audio files and replaces the temporary local queue; Previous/Next then navigates that queue. Set `autoPlay` explicitly to request automatic playback. `FocusDeck` remains as a compatibility alias.

## Composition

- `VinylDeck` coordinates tracks, audio, cover extraction, and the optional background.
- `VinylTurntable` is the standalone SVG hardware body and does not require the background or audio hooks.
- `VinylDeckBackground` is independently reusable and optionally exposes multi-file upload and shadow-angle controls.
- Runtime hooks live in `hooks/`; audio metadata parsing lives in `utils/`.

The volume dial uses a constrained 260° range with 5% detents, keyboard control, and click-to-mute/restore. Uploaded MP3 ID3v2 and FLAC metadata updates the title, artist, album, genre, year, BPM, format, and cover; missing fields fall back to safe file information. `onAudioFilesChange` receives the full queue, while `onAudioFileChange` keeps first-file compatibility. Remote audio needs CORS permission for spectrum analysis.

The left hardware toggles enable automatic advance and shuffle. Both modes support controlled props (`autoAdvance`, `shuffle`), initial defaults, and change callbacks. Information always includes the active track title.

Decorative text is non-selectable, controls expose button/slider semantics, and reduced-motion preferences disable continuous rotation and staged drawing.
