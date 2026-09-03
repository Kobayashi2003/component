# EPUB Reader documentation

Read the numbered guides in order when integrating or changing the reader:

1. [Getting started](./01-getting-started.md) — render a local EPUB with the supplied React interface.
2. [Host integration](./02-host-integration.md) — choose the complete shell, a custom React shell, or the Core API.
3. [Architecture](./03-architecture.md) — understand ownership, dependencies, and composition boundaries.
4. [EPUB processing](./04-epub-processing.md) — follow archive loading, compatibility, resources, and preflight.
5. [Rendering and interaction](./05-rendering-and-interaction.md) — understand rendition planning, navigation, and semantic input.
6. [Reading data](./06-reading-data.md) — persist positions, preferences, and marks without persisting book bytes.
7. [Controlled extensions](./07-controlled-extensions.md) — add behavior through typed, bounded mechanisms.
8. [UI configuration](./08-ui-configuration.md) — configure the Shell and register React tools and surfaces.
9. [Roadmap](./09-roadmap.md) — separate Reader work from higher-level reading-suite capabilities.

Reference material:

- [Domain language](../CONTEXT.md) defines canonical terms without implementation detail.
- [ADR 0001](./adr/0001-controlled-reader-extension-boundaries.md) records the Core extension boundary.
- [ADR 0002](./adr/0002-controlled-react-ui-composition.md) records the React composition boundary.
- [Test guide](../tests/README.md) explains verification levels and local corpus commands.

The architecture diagram is generated from the editable Draw.io source in [`diagrams/architecture-overview.drawio`](./diagrams/architecture-overview.drawio). Run `npm run docs:diagrams` from this package after changing it. Set `DRAWIO_PATH` when the Draw.io desktop executable is not available on `PATH` or in its default install location.
