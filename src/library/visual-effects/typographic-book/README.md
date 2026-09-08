# Typographic Book

Pale lettering wraps a transparent 3D book, with a projecting swallowtail bookmark and a replaceable red background.

## Usage

```tsx
import { TypographicBook } from './typographic-book'

<TypographicBook backgroundColor="#f01808" />
```

## Props

- `backgroundColor`: scene and label ink color; defaults to `#f01808`.
- `className`: applies to the wrapper.

## Controls

- Drag or use arrow keys to orbit; Shift + drag or Q / E to roll.
- Use + / − to zoom and 0 / Home to reset. Buttons support touch input.
- Camera views stay in front, left, and below the book. The showcase includes a background color picker.

## Notes

- Local SVG artwork on transparent CSS 3D planes; the bookmark emerges from the middle of the bottom page edge and hangs below the book.
- Static artwork is memoized during camera movement. No external assets or animation loop.
- Keyboard focus and image descriptions are included. Motion is direct, with no automatic animation or easing.
- Intended for editorial artwork; the five-line English title is a fixed composition.
