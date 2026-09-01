import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type MutableRefObject } from 'react';
import type { ReaderPanelId } from './reader-surfaces';
import type { EpubReaderFullscreenController } from './use-epub-reader-fullscreen';
import type { ReaderChromeControls } from './use-reader-chrome';
import { FullscreenIcon, HistoryIcon, MoreIcon, PinIcon, ReaderToolIcon } from './reader-icons';
import { READER_PANELS } from './reader-toolbar-model';

export function HistoryButton({ direction, enabled, onActivate }: { readonly direction: 'back' | 'forward'; readonly enabled: boolean; readonly onActivate: () => void }) {
  const back = direction === 'back';
  const label = back ? 'Back to previous reading location' : 'Forward to next reading location';
  return (
    <button
      className={`epub-reader-shell__tool is-secondary epub-reader-shell__history is-${direction}`}
      type="button"
      disabled={!enabled}
      aria-label={label}
      aria-keyshortcuts={back ? 'Alt+ArrowLeft' : 'Alt+ArrowRight'}
      title={`${label} (${back ? 'Alt+Left' : 'Alt+Right'})`}
      onClick={onActivate}
    >
      <HistoryIcon direction={direction} />
      <span>{back ? 'Back' : 'Forward'}</span>
    </button>
  );
}

interface PanelButtonProps {
  readonly key?: string;
  readonly item: (typeof READER_PANELS)[number];
  readonly panel: ReaderPanelId | null;
  readonly panelId: string;
  readonly buttonRefs: MutableRefObject<Map<ReaderPanelId, HTMLButtonElement>>;
  readonly onToggle: (panel: ReaderPanelId, origin: HTMLButtonElement) => void;
  readonly secondary?: boolean;
}

export function PanelButton({ item, panel, panelId, buttonRefs, onToggle, secondary = false }: PanelButtonProps) {
  return (
    <button
      className={`epub-reader-shell__tool${secondary ? ' is-secondary' : ''}`}
      type="button"
      ref={(element: HTMLButtonElement | null) => {
        if (element) buttonRefs.current.set(item.id, element);
        else buttonRefs.current.delete(item.id);
      }}
      aria-pressed={panel === item.id}
      aria-expanded={panel === item.id}
      aria-controls={panel === item.id ? panelId : undefined}
      aria-keyshortcuts={item.id === 'search' ? 'Control+F Meta+F' : item.id === 'help' ? '?' : undefined}
      aria-label={item.label}
      title={item.label}
      onClick={(event: MouseEvent<HTMLButtonElement>) => onToggle(item.id, event.currentTarget)}
    >
      <ReaderToolIcon id={item.id} />
      <span>{item.shortLabel}</span>
    </button>
  );
}

interface CompactReaderToolsMenuProps {
  readonly id: string;
  readonly panel: ReaderPanelId | null;
  readonly panelId: string;
  readonly fullscreen: EpubReaderFullscreenController;
  readonly readerChrome: ReaderChromeControls;
  readonly onTogglePanel: (panel: ReaderPanelId, origin: HTMLButtonElement) => void;
}

export function CompactReaderToolsMenu({
  id,
  panel,
  panelId,
  fullscreen,
  readerChrome,
  onTogglePanel,
}: CompactReaderToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const owner = rootRef.current?.ownerDocument;
    const closeFromPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    owner?.addEventListener('pointerdown', closeFromPointer, true);
    const frame = requestAnimationFrame(() => {
      menuButtons(menuRef.current)[0]?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      owner?.removeEventListener('pointerdown', closeFromPointer, true);
    };
  }, [open]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  const activatePanel = (next: ReaderPanelId) => {
    const origin = triggerRef.current;
    close();
    if (origin) onTogglePanel(next, origin);
  };
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = menuButtons(menuRef.current);
    const next = nextMenuIndex(event.key, buttons.indexOf(event.target as HTMLButtonElement), buttons.length);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (next == null) return;
    event.preventDefault();
    buttons[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="epub-reader-shell__compact-tools"
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <button
        ref={triggerRef}
        className="epub-reader-shell__tool is-secondary"
        type="button"
        aria-label="More reader tools"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="More reader tools"
        onClick={() => setOpen(current => !current)}
      >
        <MoreIcon />
        <span>More</span>
      </button>
      {open ? (
        <div
          id={id}
          ref={menuRef}
          className="epub-reader-shell__tools-menu"
          role="menu"
          aria-label="More reader tools"
          onKeyDown={handleMenuKeyDown}
        >
          {READER_PANELS.slice(4).map(item => (
            <button
              key={item.id}
              className="epub-reader-shell__tool"
              type="button"
              role="menuitem"
              aria-pressed={panel === item.id}
              aria-controls={panel === item.id ? panelId : undefined}
              onClick={() => activatePanel(item.id)}
            >
              <ReaderToolIcon id={item.id} />
              <span>{item.shortLabel}</span>
            </button>
          ))}
          <button
            className="epub-reader-shell__tool"
            type="button"
            role="menuitem"
            disabled={!fullscreen.supported}
            aria-pressed={fullscreen.active}
            onClick={() => {
              close();
              void fullscreen.toggle();
            }}
          >
            <FullscreenIcon active={fullscreen.active} />
            <span>{fullscreen.active ? 'Exit full screen' : 'Full screen'}</span>
          </button>
          <button
            className="epub-reader-shell__tool"
            type="button"
            role="menuitem"
            aria-pressed={readerChrome.pinned}
            onClick={() => {
              readerChrome.setPinned(!readerChrome.pinned);
              close(true);
            }}
          >
            <PinIcon active={readerChrome.pinned} />
            <span>{readerChrome.pinned ? 'Unpin controls' : 'Pin controls'}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function nextMenuIndex(key: string, current: number, length: number): number | null {
  if (length === 0) return null;
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % length;
  if (key === 'ArrowUp') return current < 0 ? length - 1 : (current - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

function menuButtons(menu: HTMLDivElement | null): HTMLButtonElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')) : [];
}
