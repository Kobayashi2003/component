# Component Atlas

Component Atlas is a curated collection of interesting interface effects, interaction ideas, and reusable components. Most entries are implemented and packaged with React, but the real subject of the project is the idea: how it looks, how it moves, how it responds, and when it is useful.

The repository is both a workshop and a record. Experiments may begin small, but each one should remain understandable, independently loadable, and easy to revisit.

## Project protocol

The following rules are the repository contract:

1. **One primary idea per entry.** Keep each entry focused enough to understand without reading unrelated code.
2. **React is the default delivery format.** Implement entries as isolated React components unless the experiment specifically requires another browser technology. Explain exceptions in the entry README.
3. **Browse existing categories before creating one.** A new category is justified only when the work does not fit an existing category without distorting that category's meaning. Update this README, the catalog registry, and add a category README when a category is introduced.
4. **Every entry is self-documented.** An entry is incomplete without its own `README.md`, metadata, demo module, and any local styles or assets it needs.
5. **Describe experience as well as implementation.** Documentation must cover visual character, motion, interaction, intended use, and accessibility—not only props and code.
6. **Keep entries portable.** Do not reach into another entry's private files. Shared primitives belong under `src/shared` after at least two real entries need them.
7. **Load on demand.** The catalog may eagerly read small metadata files, but demo code and entry documentation must be dynamically imported only when the visitor opens that entry.
8. **Respect user preferences.** Animated work must consider `prefers-reduced-motion`; interactive work must consider keyboard access, focus, touch, and semantic HTML where applicable.
9. **Prefer a clear experiment over a premature abstraction.** Extract shared APIs only after repeated use reveals a stable shape.
10. **Leave the catalog healthy.** Before considering an entry complete, run `npm run lint` and `npm run build`.

## Catalog categories

Use the closest existing category:

| Category | Use it for |
| --- | --- |
| `visual-effects` | Light, texture, distortion, masking, particles, decorative depth, and shader-like treatments |
| `interactions` | Pointer, keyboard, gesture, drag, selection, and direct-manipulation ideas |
| `layout-navigation` | Layout systems, menus, spatial navigation, responsive composition, and page transitions |
| `data-display` | Tables, charts, timelines, metrics, diagrams, and information-rich surfaces |
| `forms-input` | Fields, pickers, validation, editing, and data-entry flows |
| `feedback-status` | Loading, progress, notifications, errors, confirmations, and empty states |

When an entry spans categories, choose the category that represents its **main reusable idea**. Tags can describe secondary qualities.

## Directory structure

```text
.
├─ README.md
├─ src/
│  ├─ catalog/                 # Category registry, discovery, and catalog types
│  ├─ components/              # Components used by the showcase itself
│  ├─ library/
│  │  ├─ <category>/
│  │  │  ├─ README.md          # Category scope and placement guidance
│  │  │  └─ <entry-slug>/
│  │  │     ├─ README.md       # Visual, motion, usage, and accessibility notes
│  │  │     ├─ meta.ts         # Small, eagerly loaded catalog metadata
│  │  │     ├─ index.tsx       # Default-exported, lazily loaded demo
│  │  │     ├─ styles.css      # Entry-local styles, when needed
│  │  │     └─ assets/         # Entry-local assets, when needed
│  │  └─ ...
│  ├─ shared/                  # Proven cross-entry primitives only
│  ├─ App.tsx                  # Directory-style showcase
│  └─ main.tsx
└─ ...tooling files
```

Directory names use lowercase kebab-case. The category directory, entry directory, `meta.ts` values, and catalog URL must agree. The catalog validates this relationship at startup.

## Entry contract

Each entry must contain:

### `meta.ts`

```ts
import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'example-name',
  title: 'Example Name',
  category: 'interactions',
  kind: 'component', // component | effect | experiment
  status: 'experimental', // stable | experimental | draft
  summary: 'One sentence describing the central idea.',
  tags: ['keyboard', 'selection'],
} satisfies CatalogEntryMeta
```

### `index.tsx`

The module must default-export a renderable React component. It is a demo boundary, so it should present the idea in a useful state without requiring catalog-specific props.

### `README.md`

Use these sections, adapting them when the subject calls for more detail:

```md
# Entry Name

## Visual character
What is visible: composition, color, typography, depth, texture, and states.

## Motion and interaction
What moves, what triggers it, timing/easing, input methods, and state transitions.

## Implementation notes
The important technique, constraints, dependencies, and noteworthy trade-offs.

## Intended use
Where the idea works, where it does not, and how prominently it should be used.

## Accessibility
Keyboard, focus, semantics, contrast, reduced motion, touch, and announcements as relevant.
```

Add an API section only when the entry exposes a meaningful reusable API. Documentation should explain the experience in plain language before discussing implementation.

## Adding an entry

1. Review the category table and each relevant category README.
2. Create `src/library/<category>/<entry-slug>/`.
3. Add `meta.ts`, `index.tsx`, and `README.md` using the contracts above.
4. Keep styles and assets inside the entry unless they are genuinely shared.
5. Confirm the entry appears in its category and opens at its generated catalog URL.
6. Test pointer, keyboard, narrow-screen, and reduced-motion behavior as relevant.
7. Run the verification commands.

No central entry list needs to be edited. Vite discovers metadata at build time and creates separate lazy chunks for each demo module.

## Adding a category

Adding a category is intentionally more expensive than adding an entry:

1. Confirm that none of the existing category definitions can accurately contain the work.
2. Write a short boundary statement: what belongs, what does not, and how it differs from its nearest category.
3. Add the category ID and definition in `src/catalog/types.ts` and `src/catalog/catalog.ts`.
4. Create `src/library/<category>/README.md` with the boundary statement.
5. Add the category to the table in this README.

## Showcase architecture

The root application is a small directory-style browser rather than a page that renders every experiment. It has three route levels:

- `#/` lists categories using lightweight metadata.
- `#/category/<category>` lists entries within one category.
- `#/entry/<category>/<entry>` dynamically imports only that demo and its Markdown documentation.

This keeps the landing page quick as the collection grows and lets entries carry large libraries or assets without taxing unrelated visitors.

## Local development

```bash
npm install
npm run dev
```

Verify changes with:

```bash
npm run lint
npm run build
```

The project currently uses Vite, React, and TypeScript.
