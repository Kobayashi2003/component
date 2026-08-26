import type { ReaderThemeDefinition } from '../../appearance';
import type { RenditionPlan } from '../../rendition';
import type { ReflowableRendererPolicy } from './model';

export const READER_LAYOUT_STYLE_ID = 'epub-reader-layout-style';
export const READER_PREFERENCES_STYLE_ID = 'epub-reader-preferences-style';
export const READER_VERTICAL_EXTENT_STYLE_ID = 'epub-reader-vertical-page-extent-style';

export function buildReflowableLayoutCss(
  plan: RenditionPlan,
  policy: ReflowableRendererPolicy,
  writingMode = plan.writingMode.value,
): string {
  const width = cssPixels(plan.viewport.width);
  const height = cssPixels(plan.viewport.height);
  const pageGap = reflowablePageGap(plan, policy, writingMode);
  const pageWidthValue = reflowablePageWidth(plan, policy, writingMode);
  const pageWidth = cssPixels(pageWidthValue);
  const pageInset = writingMode === 'horizontal-tb'
    ? cssPixels(reflowablePageInset(plan, policy, writingMode))
    : '0px';
  const inlinePadding = `${plan.preferences.pageMarginPercent}%`;
  const leadingBlank = reflowableNeedsLeadingBlankPage(plan);

  if (plan.renderer === 'reflowable-paginated') {
    // Horizontal writing needs multicol fragmentation because authored block
    // flow is vertical. Vertical writing already advances blocks on physical X;
    // forcing multicol there creates columns on physical Y (the exact failure
    // that made Japanese chapters appear only in the right half of the spread).
    if (writingMode !== 'horizontal-tb') {
      const margin = writingMode === 'vertical-rl' ? '0 0 0 auto' : '0 auto 0 0';
      return `
html {
  box-sizing: border-box !important;
  width: ${width} !important;
  height: ${height} !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scrollbar-width: none !important;
  scroll-behavior: auto !important;
}
html, body { scrollbar-width: none !important; }
html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
body {
  box-sizing: border-box !important;
  width: ${pageWidth} !important;
  height: ${height} !important;
  min-width: ${pageWidth} !important;
  min-height: ${height} !important;
  margin: ${margin} !important;
  padding: 0 !important;
  padding-inline: ${inlinePadding} !important;
  column-width: auto !important;
  column-count: auto !important;
  column-gap: 0 !important;
  column-fill: balance !important;
  column-rule: none !important;
  overflow: visible !important;
}
${policy.containReplacedElements ? replacedElementContainmentCss() : ''}
`;
    }

    const gap = cssPixels(pageGap);
    return `
html {
  box-sizing: border-box !important;
  width: ${width} !important;
  height: ${height} !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scrollbar-width: none !important;
  scroll-behavior: auto !important;
}
html, body { scrollbar-width: none !important; }
html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
body {
  box-sizing: border-box !important;
  position: relative !important;
  inset-inline-start: ${pageInset} !important;
  width: ${pageWidth} !important;
  height: ${height} !important;
  min-width: ${pageWidth} !important;
  min-height: ${height} !important;
  margin: 0 !important;
  padding: 0 !important;
  column-width: ${pageWidth} !important;
  column-gap: ${gap} !important;
  column-fill: auto !important;
  column-rule: none !important;
  overflow: visible !important;
}
${leadingBlank ? leadingBlankColumnCss() : ''}
${policy.containReplacedElements ? replacedElementContainmentCss() : ''}
`;
  }

  return `
html {
  box-sizing: border-box !important;
  width: 100% !important;
  min-width: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: auto !important;
  scroll-behavior: auto !important;
}
html, body {
  scrollbar-width: thin;
  scrollbar-color: rgba(96, 98, 94, 0.58) transparent;
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
html::-webkit-scrollbar-track, body::-webkit-scrollbar-track {
  background: transparent;
}
html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb {
  min-height: 32px;
  border: 3px solid transparent;
  border-radius: 999px;
  background: rgba(96, 98, 94, 0.58);
  background-clip: padding-box;
}
html::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover {
  background-color: rgba(74, 77, 72, 0.78);
}
html::-webkit-scrollbar-button, body::-webkit-scrollbar-button,
html::-webkit-scrollbar-corner, body::-webkit-scrollbar-corner {
  display: none;
  background: transparent;
}
body {
  box-sizing: border-box !important;
  min-width: 100% !important;
  min-height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  padding-inline: ${inlinePadding} !important;
  column-width: auto !important;
  column-count: auto !important;
  column-gap: normal !important;
  column-fill: balance !important;
  overflow: visible !important;
}
${policy.containReplacedElements ? replacedElementContainmentCss() : ''}
`;
}

export function reflowablePageGap(
  plan: RenditionPlan,
  policy: ReflowableRendererPolicy,
  writingMode = plan.writingMode.value,
): number {
  // Vertical pagination uses native horizontal block overflow instead of CSS
  // columns. A synthetic inter-page gutter would become content overlap unless
  // every block were fragmented into reader-owned wrappers, so page slots use
  // the full viewport width and the UI may draw any visual gutter outside the
  // publication document.
  if (writingMode !== 'horizontal-tb') return 0;
  const baseGap = baseReflowablePageGap(plan, policy);
  return baseGap + (reflowablePageInset(plan, policy, writingMode) * 2);
}

export function reflowablePageWidth(
  plan: RenditionPlan,
  policy: ReflowableRendererPolicy,
  writingMode = plan.writingMode.value,
): number {
  const slotWidth = physicalPageSlotWidth(plan, policy, writingMode);
  if (writingMode !== 'horizontal-tb') return slotWidth;
  return Math.max(1, slotWidth - (reflowablePageInset(plan, policy, writingMode) * 2));
}

export function reflowablePageInset(
  plan: RenditionPlan,
  policy: ReflowableRendererPolicy,
  writingMode = plan.writingMode.value,
): number {
  if (writingMode !== 'horizontal-tb' || plan.renderer !== 'reflowable-paginated') return 0;
  const slotWidth = physicalPageSlotWidth(plan, policy, writingMode);
  return Math.max(0, slotWidth * (plan.preferences.pageMarginPercent / 100));
}

function physicalPageSlotWidth(
  plan: RenditionPlan,
  policy: ReflowableRendererPolicy,
  writingMode: RenditionPlan['writingMode']['value'],
): number {
  const visible = plan.spread.execution === 'intra-document' ? 2 : 1;
  if (writingMode !== 'horizontal-tb') return Math.max(1, plan.viewport.width / visible);
  const gap = baseReflowablePageGap(plan, policy);
  return visible === 2 ? Math.max(1, (plan.viewport.width - gap) / 2) : plan.viewport.width;
}

function baseReflowablePageGap(plan: RenditionPlan, policy: ReflowableRendererPolicy): number {
  return plan.spread.mode === 'double' && plan.spread.gap === 'none' ? 0 : policy.pageGap;
}

export function reflowableNeedsLeadingBlankPage(plan: RenditionPlan): boolean {
  if (plan.spread.execution !== 'intra-document' || plan.spread.mode !== 'double') return false;
  const placement = plan.spread.placement;
  if (placement !== 'left' && placement !== 'right') return false;
  const defaultFirst = plan.pageProgression.value === 'rtl' ? 'right' : 'left';
  return placement !== defaultFirst;
}

function leadingBlankColumnCss(): string {
  return `
body::before {
  content: "" !important;
  display: block !important;
  inline-size: 100% !important;
  block-size: 100% !important;
  break-after: column !important;
}
`;
}

export function buildVerticalPageExtentCss(
  slotCount: number,
  pageExtent: number,
  leadingBlankCount: 0 | 1 = 0,
): string {
  if (!Number.isInteger(slotCount) || slotCount < 1) throw new RangeError('slotCount must be an integer >= 1.');
  if (!Number.isFinite(pageExtent) || pageExtent <= 0) throw new RangeError('pageExtent must be positive and finite.');
  return `
body {
  width: ${cssPixels(slotCount * pageExtent)} !important;
  min-width: ${cssPixels(slotCount * pageExtent)} !important;
  padding-block-start: ${leadingBlankCount === 0 ? '0px' : cssPixels(pageExtent)} !important;
}
`;
}

export function removeReaderStyle(document: Document, id: string): void {
  document.getElementById(id)?.remove();
}

export function buildReaderPreferenceCss(plan: RenditionPlan, resolvedTheme?: ReaderThemeDefinition | null): string {
  const preferences = plan.preferences;
  const rules: string[] = [
    `font-size: ${preferences.fontSizePercent}% !important`,
  ];

  if (preferences.fontFamily) {
    rules.push(`font-family: ${safeFontFamily(preferences.fontFamily)} !important`);
  }
  if (preferences.lineHeight != null) {
    rules.push(`line-height: ${preferences.lineHeight} !important`);
  }
  const theme = themeDeclarations(preferences.theme, resolvedTheme);
  if (theme?.body) rules.push(...theme.body);
  const extra: string[] = [];
  if (theme?.link) extra.push(`a, a:link, a:visited { color: ${theme.link} !important; }`);
  if (theme?.forceTextColor) {
    extra.push(`:where(p, span, div, li, td, th, blockquote, figcaption, cite, em, strong, b, i, u, small, sub, sup, code, pre, h1, h2, h3, h4, h5, h6) { color: inherit !important; }`);
  }

  return `
body {
  ${rules.join(';\n  ')};
}
${extra.join('\n')}
`;
}

export function upsertReaderStyle(document: Document, id: string, css: string): HTMLStyleElement {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElementNS('http://www.w3.org/1999/xhtml', 'style') as HTMLStyleElement;
    style.id = id;
    (document.head ?? document.documentElement).appendChild(style);
  }
  style.textContent = css;
  return style;
}

function replacedElementContainmentCss(): string {
  return `
img, svg, video, canvas, object, embed, iframe {
  max-inline-size: 100% !important;
  max-block-size: 100% !important;
  object-fit: contain;
  break-inside: avoid;
}
`;
}

function themeDeclarations(theme: string, resolved?: ReaderThemeDefinition | null): { body: string[]; link?: string; forceTextColor: boolean } | null {
  const value = resolved ?? builtinTheme(theme);
  if (!value || value.id === 'publisher') return null;
  const body: string[] = [];
  const foreground = safeCssValue(value.foreground);
  const background = safeCssValue(value.background);
  const link = safeCssValue(value.link);
  if (foreground) body.push(`color: ${foreground} !important`);
  if (background) body.push(`background: ${background} !important`);
  if (value.colorScheme && value.colorScheme !== 'normal') body.push(`color-scheme: ${value.colorScheme}`);
  return { body, ...(link ? { link } : {}), forceTextColor: value.forceTextColor ?? false };
}


function safeCssValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /[;{}\r\n\f]/u.test(trimmed)) return null;
  return trimmed;
}

function builtinTheme(theme: string): ReaderThemeDefinition | null {
  if (theme === 'light') return { id: 'light', foreground: '#1a1a1a', background: '#ffffff', link: '#1a73e8', colorScheme: 'light' };
  if (theme === 'dark') return { id: 'dark', foreground: '#e8e8e8', background: '#161616', link: '#8ab4f8', colorScheme: 'dark', forceTextColor: true };
  if (theme === 'sepia') return { id: 'sepia', foreground: '#2b2118', background: '#f4ecd8', link: '#7a4f2a', colorScheme: 'light' };
  if (theme === 'paper') return { id: 'paper', foreground: '#29251f', background: '#f7f1e3', link: '#765334', colorScheme: 'light' };
  if (theme === 'mist') return { id: 'mist', foreground: '#253038', background: '#edf2f5', link: '#386b82', colorScheme: 'light' };
  if (theme === 'graphite') return { id: 'graphite', foreground: '#e5e8eb', background: '#202329', link: '#91b9d0', colorScheme: 'dark', forceTextColor: true };
  return null;
}

function quoteCssString(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, ' ')}"`;
}

function safeFontFamily(value: string): string {
  const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace']);
  const families = value.split(',').map(part => part.trim()).filter(Boolean);
  if (families.length === 0) return 'serif';
  return families.map(family => genericFamilies.has(family.toLowerCase()) ? family.toLowerCase() : quoteCssString(family)).join(', ');
}

function cssPixels(value: number): string {
  return `${Math.max(1, value)}px`;
}
