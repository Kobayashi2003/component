import type { CSSProperties } from 'react';

interface TouchNavigationPreviewProps {
  readonly mode: string;
  readonly zonePercent: number;
  readonly progression: string;
}

export function TouchNavigationPreview({ mode, zonePercent, progression }: TouchNavigationPreviewProps) {
  const style = { '--touch-zone-width': `${zonePercent}%` } as CSSProperties;
  const tap = mode === 'both' || mode === 'tap';
  const swipe = mode === 'both' || mode === 'swipe';
  return (
    <div className={`epub-touch-preview${tap ? ' has-tap' : ''}${swipe ? ' has-swipe' : ''} is-${progression}`} style={style} aria-label={`${mode} touch navigation preview`}>
      <span className="epub-touch-preview__zone is-left" aria-hidden="true" />
      <span className="epub-touch-preview__page" aria-hidden="true" />
      <span className="epub-touch-preview__zone is-right" aria-hidden="true" />
      {swipe ? <span className="epub-touch-preview__swipe" aria-hidden="true">→</span> : null}
    </div>
  );
}

interface ComicLayoutPreviewProps {
  readonly fit: string;
  readonly gutter: number;
  readonly spread: string;
  readonly progression: string;
}

export function ComicLayoutPreview({ fit, gutter, spread, progression }: ComicLayoutPreviewProps) {
  const style = { '--comic-preview-gap': `${Math.min(gutter, 24) / 2}px` } as CSSProperties;
  return (
    <div className={`epub-comic-layout-preview is-${fit}${spread === 'single' ? ' is-single' : ''}`} style={style} aria-label={`${fit} comic page preview, ${progression} progression`}>
      <span className="epub-comic-layout-preview__direction">{progression === 'rtl' ? 'RTL' : progression === 'ltr' ? 'LTR' : 'AUTO'}</span>
      <div className="epub-comic-layout-preview__pages" aria-hidden="true">
        <span><i /><i /><i /></span><span><i /><i /><i /></span>
      </div>
    </div>
  );
}

interface TextLayoutPreviewProps {
  readonly fontFamily: string | null;
  readonly fontSizePercent: number;
  readonly lineHeight: number | null;
  readonly marginPercent: number;
  readonly theme: string;
  readonly vertical: boolean;
}

export function TextLayoutPreview({ fontFamily, fontSizePercent, lineHeight, marginPercent, theme, vertical }: TextLayoutPreviewProps) {
  const style = {
    '--preview-font-family': fontFamily ?? 'Georgia, serif',
    '--preview-font-scale': String(fontSizePercent / 100),
    '--preview-line-height': String(lineHeight ?? 1.55),
    '--preview-margin': `${marginPercent / 2}%`,
  } as CSSProperties;
  return (
    <div
      className={`epub-text-layout-preview is-${theme}${vertical ? ' is-vertical' : ''}`}
      style={style}
      aria-label={`${vertical ? 'Vertical' : 'Horizontal'} text layout preview`}
    >
      <span aria-hidden="true">{vertical ? '静かな読書の時間' : 'A quiet page for focused reading.'}</span>
    </div>
  );
}
