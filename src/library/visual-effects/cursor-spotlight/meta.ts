import type { CatalogEntryMeta } from "../../../catalog/types";

export default {
  slug: "cursor-spotlight",
  title: "Cursor Spotlight",
  category: "visual-effects",
  kind: "effect",
  status: "experimental",
  summary:
    "A reusable diffused cursor light that reveals surface, color, and depth without intercepting interaction.",
  style: "dimensional lighting",
  tags: [
    { label: "Pointer hover", group: "input" },
    { label: "Cursor light", group: "feature" },
    { label: "Spotlight", group: "feature" },
    { label: "CSS variables", group: "technology" },
    { label: "Reduced motion", group: "support" },
    { label: "Touch limited", group: "support" },
  ],
  compatibility: {
    touch: "limited",
    message: "This effect depends on hover and continuous pointer position, so touch-only devices receive a reduced experience.",
  },
} satisfies CatalogEntryMeta;
