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
    "pointer drag",
    "keyboard",
    "Web Audio",
    "file input",
    "SVG",
    "CRT display",
  ],
} satisfies CatalogEntryMeta;
