# 06 · Reading data

The reader separates host-owned EPUB bytes from resumable Reading Session data. No book bytes are persisted or uploaded by the reader.

## Session record

The framework-neutral `ReadingSessionRecord` contains:

- the last committed Locator;
- reader preferences when preference persistence is enabled;
- bookmarks, highlights, and annotations;
- an update timestamp.

The React adapter derives a default key from publication bytes and an optional source name. Hosts may provide an explicit key when identity is already known.

## Storage

`ReadingSessionStorage` is a synchronous port with `load`, `save`, and `remove`. The default `BrowserReadingSessionStorage` uses `localStorage` on a best-effort basis and isolates storage or JSON failures from reading.

```tsx
<EpubReader
  source={file}
  readerOptions={{
    readingSession: {
      key: publicationId,
      storage: productReadingSessionStorage,
      persistPreferences: true,
      saveDelayMs: 500,
    },
  }}
/>
```

Pass `readingSession: false` to disable persistence. `reader.clearReadingSession()` removes the current persisted record without deleting the source. The complete settings tool exposes the equivalent local-data action.

This project is in development: persisted application records are disposable and are not migrated from older code schemas. Authored-book compatibility remains independent and is described in [EPUB processing](./04-epub-processing.md).

The default browser adapter accepts only the complete current record shape. It rejects unknown fields, partial preferences or compatibility settings, malformed Locator channels, invalid mark variants, and invalid timestamps as one record rather than attempting partial recovery.

## Runtime caches

Search indexes and render materializations are session-scoped performance caches, not user data:

- the default search cache retains at most 12 section indexes or about 8 MiB;
- the default content cache retains at most 8 serialized documents or about 8 MiB;
- cache identities include the relevant Compatibility Profile signature;
- `reader.search.clearCache()` clears search indexes without clearing visible results;
- disposing the reader clears caches, live documents, pending work, and resource URLs.

## Future data boundary

Backup, restore, cross-device sync, reading statistics, and library metadata belong above the single-publication Reader. They should consume explicit Reader Events and storage ports rather than make Core depend on an account, network, or book-library service. The split is listed in [Roadmap](./09-roadmap.md).
