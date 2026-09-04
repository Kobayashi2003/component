# Architecture

The host supplies EPUB bytes and product configuration. React adapts immutable
state to the fixed Reader Shell. Core owns publication processing, rendering,
navigation, resource lifetime, and reading-session consistency.

![EPUB Reader overall architecture](./diagrams/architecture-overview.svg)

## Dependency direction

```text
host / showcase -> react -> core
```

Core never imports React or Showcase code. Host applications consume the React
entry or the Core entry according to the integration level they need.

## Ownership summary

| Layer | Primary responsibility                                                 |
| ----- | ---------------------------------------------------------------------- |
| Host  | source acquisition, surrounding product, and remote services           |
| React | state adaptation, fixed Shell, focus, responsive UI, and surfaces      |
| Core  | EPUB processing, rendition, interaction, features, and session runtime |

The fixed boundaries are deliberate: archive safety and renderer transactions
remain in Core; Shell focus, dismissal, and accessibility remain in React;
product workflows remain in the host.

## Authoritative maintainer documentation

- [Core architecture](../core/docs/architecture.md) describes publication
  opening, runtime collaboration, rendering transactions, and locators.
- [Core module map](../core/docs/module-map.md) records Core directory ownership.
- [React architecture](../react/docs/architecture.md) describes state adaptation
  and the fixed Reader Shell.
- [React module map](../react/docs/module-map.md) records React directory
  ownership and file placement.
- [Domain language](../CONTEXT.md) defines terms shared by all layers.

This page remains a cross-layer overview. Implementation details belong to the
directory that owns them.
