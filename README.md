# Component Atlas

Component Atlas is a curated collection of interesting interface effects, interaction ideas, and reusable components. Most entries are implemented and packaged with React, but the real subject of the project is the idea: how it looks, how it moves, how it responds, and when it is useful.

The repository is both a workshop and a record. Experiments may begin small, but each one should remain understandable, independently loadable, and easy to revisit.

## Project protocol

Keep one primary idea per entry. Follow [Library conventions](src/library/README.md) for public exports, demo separation, optional directories, metadata, accessibility and concise documentation. EPUB Reader retains its own package structure.

Before adding a category, follow the category protocol below. Verify public usage examples, relevant pointer/keyboard/touch behavior, lint and build before completing changes.

## Catalog categories

Use the closest existing category:

| Category            | Use it for                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `visual-effects`    | Light, texture, distortion, masking, particles, decorative depth, and shader-like treatments |
| `interactions`      | Pointer, keyboard, gesture, drag, selection, and direct-manipulation ideas                   |
| `layout-navigation` | Layout systems, menus, spatial navigation, responsive composition, and page transitions      |
| `data-display`      | Tables, charts, timelines, metrics, diagrams, and information-rich surfaces                  |
| `forms-input`       | Fields, pickers, validation, editing, and data-entry flows                                   |
| `feedback-status`   | Loading, progress, notifications, errors, confirmations, and empty states                    |

When an entry spans categories, choose the category that represents its **main reusable idea**. Tags can describe secondary qualities.

## Entry structure and discovery

Each entry contains `index.ts`, its main component, runtime `styles.css`, `demo/index.tsx`, optional demo styles/assets, `meta.ts`, and `README.md`. Public imports never load the showcase. Internal folders are added by responsibility, not to match a fixed depth.

Metadata must match `category/slug`; the catalog validates paths and registered tags. `usage` is `reusable` or `showcase`. Capability badges come from verified structured metadata. Tags use the central dictionary in `src/catalog/tags.ts`.

The catalog loads metadata eagerly and demos/docs lazily. Its legacy EPUB Reader loader is isolated from the ordinary entry contract.

To add an entry, select an existing category, implement the public component and a Showcase consuming its public exports, write a minimal usage example, then verify the entry route and checks. See [Library conventions](src/library/README.md) for the complete rules.

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
