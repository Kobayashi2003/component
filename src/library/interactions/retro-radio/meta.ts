import type { CatalogEntryMeta } from "../../../catalog/types";

export default {
  slug: "retro-radio",
  title: "Retro Radio",
  category: "interactions",
  kind: "component",
  status: "experimental",
  summary:
    "A tactile wooden receiver with local audio playback, analyser-driven CRT feedback, and an adjustable sparking antenna.",
  style: "tactile vintage instrument",
  tags: [
    { label: "Pointer drag", group: "input" },
    { label: "Keyboard", group: "input" },
    { label: "File input", group: "input" },
    { label: "CRT display", group: "feature" },
    { label: "Web Audio", group: "technology" },
    { label: "SVG", group: "technology" },
  ],
} satisfies CatalogEntryMeta;
