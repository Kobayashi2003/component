# 05 · Rendering and interaction

Presentation decides how an item should be shown; interaction decides what a reading action means. They collaborate through explicit plans and locators rather than reaching through each other's internals.

## Rendition planning

The planner combines publication metadata, content hints, reader preferences, and viewport metrics. Its result selects reflowable, vertical-writing, fixed-layout, or spread rendering and records writing mode, page progression, spread composition, and effective preferences.

Reader preferences are requests. The planner may ignore a setting that has no meaning for the active item—for example font size on a pre-paginated image page. Publication-scoped Shell styling stays stable across mixed-layout books even when the active renderer changes.

## Renderer transactions

`RendererHost` serializes commits and owns the active renderer. Publication documents run inside isolated, script-disabled surfaces. Reflowable pagination uses CSS fragmentation: horizontal writing advances along X and vertical writing advances along Y. Fixed-layout rendering preserves the authored viewport and applies the selected fit strategy; synthetic spreads compose compatible pages.

The content-document cache stores frozen serialized markup, hints, and diagnostics for recent items. It never retains live `Document`, iframe, selection, or renderer objects. Default count and byte limits bound retained markup.

## Locators and navigation

A Locator identifies a logical publication position with a reading-order index, resource href, and interoperable or fallback locations. Displayed page numbers are projections of the current layout, not stable reading positions.

Navigation resolves hrefs, fragments, CFIs, reading-order starts, search hits, marks, history entries, and relative page turns through the active renderer. The reader commits the new locator and immutable snapshot after the renderer transaction succeeds. Back/forward history is separate from previous/next reading movement.

## Input routing

The browser input router owns DOM listeners, gesture recognition, focus recovery, scroll containment, selection protection, and thresholds. An Input Binding receives only a normalized keyboard, wheel, tap-zone, or swipe signal plus immutable reader state. It may return one closed Reader Command; it cannot access DOM events, renderers, or navigation services.

Shortcut descriptions come from the same resolved input map and populate keyboard help, preventing behavior and help text from maintaining separate mappings.

## Reading features

- Search builds pure-data text and locator indexes and navigates with stable hit ranges. Current matching supports case sensitivity, whole-word selection, linear/non-linear scope, result limits, and excerpts. Each hit carries explicit match offsets inside its excerpt, so React does not repeat Unicode case folding to find the highlighted text.
- Marks distinguish bookmarks, highlights, and annotations. Highlights and notes carry ranges, semantic colors, highlight styles, labels, and optional tags.
- Selection, footnotes, mark activation, and images produce semantic Reader Events. React decides which transient surface to present. External links use a separate policy-approved callback because they cross the publication boundary.
- Accessibility descriptions summarize the current publication, section, position, and renderer state for the Shell.
