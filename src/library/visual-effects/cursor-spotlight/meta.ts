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
  tags: ["cursor light", "spotlight", "CSS variables", "reduced motion"],
} satisfies CatalogEntryMeta;
