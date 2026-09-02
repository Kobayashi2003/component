# EPUB Reader

A local-first EPUB reading system with a framework-independent core and an optional React shell. The host provides the bytes; the reader keeps publication state and reading activity in the browser.

## Usage

```tsx
import { EpubFilePicker, EpubReader } from './react'

const [file, setFile] = useState<File | null>(null)

<EpubFilePicker onFile={setFile} />
{file ? (
  <EpubReader source={file} />
) : null}
```

By default, `EpubReader` asks for confirmation before opening an external link; websites open in an isolated new tab. Only `http`, `https`, `mailto`, and `tel` are actionable, while executable and unsupported schemes remain blocked by the core navigation policy. A host can provide `readerOptions.onExternalLink` to replace the built-in confirmation and opening flow; the callback receives a typed destination that has already passed that policy.

## Layers

- `core/` parses and normalizes EPUBs, plans renditions, renders isolated documents, and coordinates navigation and reading services.
- `react/` adapts immutable reader snapshots to React and provides the reader interface, panels, and controls.
- `showcase/` is the local demo entry point; it is not required by applications embedding the reader.

## Notes

- `EpubReader` accepts a `Blob`, `File`, `ArrayBuffer`, or `Uint8Array`. File picking is optional.
- `EpubReader` includes a full-screen control. Hosts that need an external trigger can pair `useEpubReaderFullscreen(targetRef)` with `EpubReaderFullscreenButton`.
- EPUB bytes, reading position, and marks remain local by default; persistence is injectable.
- Search caches lightweight text/locator indexes rather than parsed chapter DOM. The default cache keeps at most 12 sections or approximately 8 MiB; hosts can set `readerOptions.searchCachePolicy` and call `reader.search.clearCache()` when they need a tighter lifecycle.
- Rendering keeps an immutable, serialized materialization of recently visited spine documents, never a live iframe or DOM tree. The default keeps at most 8 documents or approximately 8 MiB; hosts can adjust or disable it with `readerOptions.contentDocumentCachePolicy`.
- Opening preflights only the initial spine item and its immediate neighbours before first layout. Navigation awaits any missing local window, while the remaining publication profile is deduplicated and completed during browser idle time; EPUB compatibility checks are unchanged.
- See [Architecture](./docs/architecture.md) for the lifecycle and ownership boundaries.
