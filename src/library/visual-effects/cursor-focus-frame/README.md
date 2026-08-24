# Cursor Focus Frame

A custom cursor that expands into the outline of an interactive target.

## Usage

```tsx
<CursorFocusFrame color="#e6ff69" padding={8} duration={260}>
  <button>Regular target</button>
  <button data-cursor-path="M...Z">Irregular target</button>
</CursorFocusFrame>
```

Native controls are detected through event delegation. Border radius handles regular shapes; `data-cursor-path` supplies a normalized `0 0 100 100` SVG path for irregular silhouettes. While a frame returns from a target, its destination keeps following the latest pointer position so fast exits do not leave a stale outline drifting behind. Leaving the root clears the active geometry immediately. Keyboard focus triggers the same outline. Touch keeps the native cursor model and reduced motion removes geometry interpolation.
