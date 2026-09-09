# Library conventions

Each entry lives at `category/slug`. Keep EPUB Reader's existing package structure separate.

## Entry layout

- `index.ts`: named public exports and required runtime CSS. Never import the demo.
- `ComponentName.tsx`: the main component and its Props.
- `styles.css`: runtime styles scoped to the entry.
- `demo/index.tsx`: default-exported `ComponentNameShowcase`, importing the public entry through `..`.
- `demo/styles.css`: showcase-only layout and controls. Empty is fine when no additional styling is needed.
- `meta.ts`: small catalog metadata, registered tag IDs, usage and verified capabilities.
- `README.md`: short user documentation.

Do not add a nested `src/` by default. Add `components/`, `hooks/`, `assets/` or a meaningful domain directory only when there is a real responsibility to separate. Prefer named modules such as `geometry.ts` over a miscellaneous utils collection. Shared types belong in `types.ts` only when multiple files consume them. Demo assets and fixture data belong in `demo/`.

Organize component files as imports, public types, constants/helpers, component state, derived values, effects, handlers, render. Keep short helpers local; do not add boilerplate section comments. Shared primitives belong in `src/shared` only after two entries need them. Use named public exports; preserve established compatibility aliases during migrations.

## Effect contract

Cursor roots accept `className`, `style`, and `disabled`. The root defines pointer tracking bounds; documentation must separately name the affected targets. Selection effects use default data attributes with optional CSS selectors. A canvas source callback remains a separate API because DOM content is not automatically a texture. Smoothing means a follow factor from 0.01 to 1; larger follows faster. Distances are CSS pixels and durations milliseconds.

Keep tuning panels outside the effect in the showcase. Include separate interactive targets inside the scene when demonstrating effects on controls. Effects must preserve child interaction, clean up resources and account for touch and reduced motion.

## Documentation

For `usage: reusable`, write one sentence, a working minimal import/render example, a compact parameter table or list with defaults, then only necessary usage notes. Advanced parameters may use a collapsed details block. Avoid implementation essays.

For `usage: showcase`, write one sentence and a minimal embedding example, with any actual resource or sizing constraints. Do not invent a reusable API for a fixed demonstration.

## Metadata and discovery

Use registered IDs from `src/catalog/tags.ts`; do not write arbitrary label/group objects in new entries. Input, feature, technology and style are the tag groups. Keyboard, touch and reduced-motion support belong to `capabilities`, and missing means unknown. Only claim capabilities that have been checked. `usage` describes reusable vs showcase, independently of kind/status.

The catalog eagerly loads metadata only. Demos and documentation remain lazy. Run lint, build and relevant interaction checks after changes; verify public imports work without demo CSS.

## Checks

`npm run format` applies the shared formatter; `npm run format:check` checks it. EPUB Reader is excluded from formatting.

Add tests only when necessary, and keep them beside the component or module they verify (for example `RotaryKnob.test.tsx` inside its entry). Do not create a repository-level tests folder or combine independent library entries in a shared test page.
