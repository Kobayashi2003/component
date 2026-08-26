# Local real-world corpus

The repository does not contain real-world EPUB files or a manifest that identifies them.

Bind one or more files or directories from the component directory:

```bash
npm run realworld:bind -- /path/to/book.epub /path/to/epub-directory
```

The command recursively discovers EPUB files, inspects their publication structure, and writes `manifest.local.json`. That file contains local absolute paths and regression expectations, so it is ignored by Git.

Run the bound corpus with:

```bash
npm run realworld:test
npm run performance:realworld
```

Set `EPUB_REALWORLD_MANIFEST` to use a different local manifest path. Re-run the bind command whenever the selected files intentionally change.
