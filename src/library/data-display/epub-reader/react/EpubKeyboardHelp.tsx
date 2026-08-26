const SHORTCUT_GROUPS = [
  {
    label: 'Navigation',
    items: [
      { keys: ['←', '→'], action: 'Turn the physical page' },
      { keys: ['PgUp', 'PgDn'], action: 'Previous or next page' },
      { keys: ['⇧ Space', 'Space'], action: 'Previous or next page' },
      { keys: ['Alt ←', 'Alt →'], action: 'Reading history' },
    ],
  },
  {
    label: 'Reader tools',
    items: [
      { keys: ['Ctrl/⌘ F'], action: 'Search this book' },
      { keys: ['Ctrl/⌘ Wheel'], action: 'Adjust text size' },
      { keys: ['C'], action: 'Show or hide controls' },
      { keys: ['?'], action: 'Keyboard help' },
      { keys: ['Esc'], action: 'Close the active tool' },
    ],
  },
] as const;

export function EpubKeyboardHelp() {
  return (
    <section className="epub-reader-panel epub-keyboard-help" aria-label="Keyboard shortcuts">
      <p>Shortcuts work while focus is in the reading area.</p>
      {SHORTCUT_GROUPS.map(group => (
        <section key={group.label} className="epub-keyboard-help__group">
          <h3>{group.label}</h3>
          <dl>
            {group.items.map(item => (
              <div key={item.action + item.keys.join()}>
                <dt>{item.keys.map(key => <kbd key={key}>{key}</kbd>)}</dt>
                <dd>{item.action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </section>
  );
}
