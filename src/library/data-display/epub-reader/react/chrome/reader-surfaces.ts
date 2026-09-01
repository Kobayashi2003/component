import { useCallback, useMemo, useState } from 'react';
import type {
  ReaderFootnote,
  ReaderImageActivation,
  ReaderMarkActivation,
  ReaderSelectionActivation,
} from '../../core';
import type { EpubSource } from '../state/model';

export type ReaderPanelId = 'contents' | 'search' | 'settings' | 'marks' | 'compatibility' | 'help';

/**
 * The one surface the reader is showing over its page, if any.
 *
 * These are mutually exclusive by nature — a panel, a footnote, the selection
 * toolbar, a mark popover and the image viewer all want the same attention and
 * the same slice of the screen. Holding them as one value is what makes that
 * exclusivity true, rather than something each opener has to remember: the
 * previous shape kept five independent flags, and every one of the six ways to
 * open a surface cleared a different subset of the other four. Opening search
 * left an open footnote on screen, opening a footnote left the selection
 * toolbar up, and so on.
 */
export type ReaderSurface =
  | { readonly kind: 'none' }
  | { readonly kind: 'panel'; readonly panel: ReaderPanelId; readonly returnFocus: HTMLElement | null }
  | {
      readonly kind: 'footnote';
      /** Guards against a note outliving the publication it was opened from. */
      readonly source: EpubSource;
      readonly footnote: ReaderFootnote;
      readonly returnFocus: HTMLElement | null;
    }
  | { readonly kind: 'selection'; readonly activation: ReaderSelectionActivation }
  | { readonly kind: 'mark'; readonly activation: ReaderMarkActivation }
  | { readonly kind: 'image'; readonly activation: ReaderImageActivation };

const NONE: ReaderSurface = { kind: 'none' };

/** Where focus belongs once this surface closes. */
export function surfaceReturnFocus(surface: ReaderSurface): HTMLElement | null {
  switch (surface.kind) {
    case 'panel':
    case 'footnote':
      return surface.returnFocus;
    case 'selection':
    case 'mark':
      return surface.activation.returnFocus;
    case 'image':
      return surface.activation.trigger;
    default:
      return null;
  }
}

export interface ReaderSurfaces {
  readonly surface: ReaderSurface;
  /** Narrow accessors, so callers read one surface without re-checking `kind`. */
  readonly panel: ReaderPanelId | null;
  readonly footnote: ReaderFootnote | null;
  readonly selection: ReaderSelectionActivation | null;
  readonly mark: ReaderMarkActivation | null;
  readonly image: ReaderImageActivation | null;
  /** True while any surface is open, whichever it is. */
  readonly open: boolean;
  show(next: ReaderSurface): void;
  close(): void;
  /** Opens `panel`, or closes it when it is already the open surface. */
  togglePanel(panel: ReaderPanelId, returnFocus: HTMLElement | null): void;
}

/**
 * @param source the publication currently open; a footnote raised from an
 * earlier one is dropped rather than shown against the wrong book.
 */
export function useReaderSurfaces(source: EpubSource): ReaderSurfaces {
  const [surface, setSurface] = useState<ReaderSurface>(NONE);

  const show = useCallback((next: ReaderSurface) => setSurface(next), []);
  const close = useCallback(() => setSurface(NONE), []);
  const togglePanel = useCallback((panel: ReaderPanelId, returnFocus: HTMLElement | null) => {
    setSurface(current => current.kind === 'panel' && current.panel === panel
      ? NONE
      : { kind: 'panel', panel, returnFocus });
  }, []);

  const live = surface.kind === 'footnote' && surface.source !== source ? NONE : surface;

  // Memoized so callers can depend on this object in their own hooks without
  // invalidating them on every render.
  return useMemo(() => ({
    surface: live,
    panel: live.kind === 'panel' ? live.panel : null,
    footnote: live.kind === 'footnote' ? live.footnote : null,
    selection: live.kind === 'selection' ? live.activation : null,
    mark: live.kind === 'mark' ? live.activation : null,
    image: live.kind === 'image' ? live.activation : null,
    open: live.kind !== 'none',
    show,
    close,
    togglePanel,
  }), [close, live, show, togglePanel]);
}
