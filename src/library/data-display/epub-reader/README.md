# EPUB Reader

A local-first EPUB reading system with a framework-independent core and an optional React shell. The host provides the bytes; the reader keeps publication state and reading activity in the browser.

## Usage

```tsx
import { EpubFilePicker, EpubReader } from './react'

const [file, setFile] = useState<File | null>(null)

<EpubFilePicker onFile={setFile} />
{file ? <EpubReader source={file} /> : null}
```

## Layers

- `core/` parses and normalizes EPUBs, plans renditions, renders isolated documents, and coordinates navigation and reading services.
- `react/` adapts immutable reader snapshots to React and provides the reader interface, panels, and controls.
- `showcase/` is the local demo entry point; it is not required by applications embedding the reader.

## Notes

- `EpubReader` accepts a `Blob`, `File`, `ArrayBuffer`, or `Uint8Array`. File picking is optional.
- EPUB bytes, reading position, and marks remain local by default; persistence is injectable.
- See [Architecture](./docs/architecture.md) for the lifecycle and ownership boundaries.
