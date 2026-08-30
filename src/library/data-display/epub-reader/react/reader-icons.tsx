export type ReaderToolId = 'contents' | 'search' | 'settings' | 'marks' | 'compatibility' | 'help';

export function ReaderToolIcon({ id }: { readonly id: ReaderToolId }) {
  const paths = id === 'contents'
    ? <><path d="M5 4.5h11a2 2 0 0 1 2 2v11H7a2 2 0 0 0-2 2z" /><path d="M7 4.5v13" /><path d="M9.5 8h5.5M9.5 11h5.5" /></>
    : id === 'search'
      ? <><circle cx="10" cy="10" r="5.5" /><path d="m14.2 14.2 4.3 4.3" /></>
      : id === 'settings'
        ? <><path d="M4 7h10M17 7h3M4 14h3M10 14h10" /><circle cx="15.5" cy="7" r="1.5" /><circle cx="8.5" cy="14" r="1.5" /></>
        : id === 'marks'
          ? <path d="M7 4.5h10v15l-5-3-5 3z" />
          : id === 'compatibility'
            ? <><path d="M12 3.8 20 7v5.2c0 4.1-3.2 7-8 8.2-4.8-1.2-8-4.1-8-8.2V7z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>
            : <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.9.5-1.3 1-1.3 2.1M12 16.8h.01" /></>;
  return <svg className="epub-reader-tool-icon" viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>;
}

export function CloseIcon() {
  return <svg className="epub-reader-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function FullscreenIcon({ active }: { readonly active: boolean }) {
  const path = active
    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
    : 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5';
  return <svg className="epub-reader-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

export function HistoryIcon({ direction }: { readonly direction: 'back' | 'forward' }) {
  return (
    <svg className="epub-reader-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === 'back' ? 'M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6' : 'm15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6'} />
    </svg>
  );
}

export function ChromeIcon({ hidden }: { readonly hidden: boolean }) {
  return (
    <svg className="epub-reader-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d={hidden ? 'M8 3v4M16 3v4M8 21v-4M16 21v-4' : 'M8 7V3M16 7V3M8 17v4M16 17v4'} />
    </svg>
  );
}

export function PinIcon({ active }: { readonly active: boolean }) {
  return (
    <svg className="epub-reader-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={active ? 'M8 4h8M9 4v6l-3 3h12l-3-3V4M12 13v7' : 'M8 4h8M9 4v6l-3 3h12l-3-3V4M12 13v7'} />
      {active ? <circle cx="12" cy="4" r="1.5" /> : null}
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg className="epub-reader-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none" />
    </svg>
  );
}
