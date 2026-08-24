# Neubrutalist Task Board

## Visual character

This board uses the Neubrutalist style from UI/UX Pro Max: paper-like background, black structural borders, offset shadows, saturated task colors, and deliberately direct typography. Color labels are paired with text and completion affordances so state does not depend on color alone.

## Motion and interaction

Filter buttons switch between all, open, and completed tasks. Each task has a native button for completion and exposes its state with `aria-pressed`. The layout collapses to one column on narrow screens. The demo keeps motion minimal and remains fully usable with reduced-motion preferences.

## Implementation notes

The component owns a small local task model so the demo is deterministic and portable. Hard-edged borders and shadows are local to this entry; they are not promoted to shared primitives until another entry needs the same API.

## Intended use

Neubrutalism works well for creative tools, startup products, and lightweight project management where hierarchy should feel immediate. It is less suitable for dense, high-frequency enterprise workflows that need quiet visual scanning.

## Accessibility

Controls are semantic buttons with 44px minimum height, visible keyboard focus, readable text labels, and a non-color completion indicator. The board remains functional without pointer interaction and supports narrow-screen touch layouts.
