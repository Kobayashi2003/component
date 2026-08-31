import { useState, type ChangeEvent } from 'react';
import { DEFAULT_READER_COMPATIBILITY_PREFERENCES, DEFAULT_READER_PREFERENCES, type ReaderCompatibilityPreferences } from '../core';
import { useOptionalEpubReaderContext } from './context';
import type { EpubReaderHandle } from './model';

const FONT_FAMILIES = [
  { value: '', label: 'Publisher default' },
  { value: 'Iowan Old Style, Palatino Linotype, Book Antiqua, Georgia, serif', label: 'Literary serif' },
  { value: 'Georgia, Times New Roman, serif', label: 'Classic serif' },
  { value: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', label: 'Modern sans' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Neutral sans' },
  { value: 'SFMono-Regular, Consolas, Liberation Mono, monospace', label: 'Monospace' },
] as const;

const THEMES = [
  { value: 'publisher', label: 'Publisher' },
  { value: 'light', label: 'Light' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'paper', label: 'Paper' },
  { value: 'mist', label: 'Mist' },
  { value: 'dark', label: 'Dark' },
  { value: 'graphite', label: 'Graphite' },
] as const;

const MARGIN_PRESETS = [
  { value: 0, label: 'Publisher' },
  { value: 6, label: 'Balanced' },
  { value: 12, label: 'Generous' },
] as const;

export function EpubSettingsPanel({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const [advanced, setAdvanced] = useState(false);
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubSettingsPanel> requires a reader prop or EpubReaderProvider.');
  const snapshot = reader.state.reader;
  const preferences = snapshot?.preferences ?? reader.state.preferences;
  if (advanced && preferences) {
    return (
      <AdvancedReaderSettings
        reader={reader}
        preferences={preferences.compatibility}
        onBack={() => setAdvanced(false)}
      />
    );
  }
  if (!snapshot || !preferences) {
    return (
      <section className="epub-reader-panel epub-settings-panel" aria-label="Reader settings">
        {preferences ? (
          <button className="epub-settings-panel__advanced-entry" type="button" onClick={() => setAdvanced(true)}>
            <span><strong>Advanced settings</strong><small>Recover from a compatibility setting that prevented the book from opening.</small></span>
            <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </section>
    );
  }
  const capabilities = snapshot.renderer.plan?.capabilities;
  // Which sections exist is a property of the publication, not of the page on
  // screen. A mixed-layout book owns both the comic controls and the typography
  // controls because it has both kinds of page; deriving this from the active
  // renderer plan instead would add and remove whole sections on every page turn.
  const layout = snapshot.presentation.layout;
  const showComicSection = layout !== 'reflowable';
  const showTextSections = layout !== 'fixed-layout';
  const verticalWriting = snapshot.presentation.writingMode !== 'horizontal-tb';
  const reflowableTypography = showTextSections
    && (layout === 'mixed' || capabilities?.textCustomization.fontSize !== false);
  const lineHeightEnabled = showTextSections
    && (layout === 'mixed' || capabilities?.textCustomization.lineHeight !== false);

  return (
    <section className="epub-reader-panel epub-settings-panel" aria-label="Reader settings">
      {showComicSection ? (
        <div className="epub-settings-panel__section epub-settings-panel__comic">
          <div className="epub-settings-panel__head">
            <h3>Comic display</h3>
            <button type="button" onClick={() => void reader.setPreferences({
              fixedLayoutFit: DEFAULT_READER_PREFERENCES.fixedLayoutFit,
              fixedLayoutGutter: DEFAULT_READER_PREFERENCES.fixedLayoutGutter,
              spread: DEFAULT_READER_PREFERENCES.spread,
              pageProgression: DEFAULT_READER_PREFERENCES.pageProgression,
            })}>Reset</button>
          </div>
          <ComicLayoutPreview
            fit={preferences.fixedLayoutFit}
            gutter={preferences.fixedLayoutGutter}
            spread={preferences.spread}
            progression={preferences.pageProgression}
          />
          <fieldset className="epub-settings-panel__segmented">
            <legend>Page fit</legend>
            <div>
              {([
                ['contain', 'Whole page'],
                ['width', 'Fit width'],
                ['height', 'Fit height'],
                ['original', 'Original'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preferences.fixedLayoutFit === value}
                  onClick={() => void reader.setPreferences({ fixedLayoutFit: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="epub-settings-panel__segmented">
            <legend>Page gutter</legend>
            <div>
              {[0, 8, 16, 24].map(value => (
                <button
                  key={value}
                  type="button"
                  disabled={preferences.spread === 'single'}
                  aria-label={`${value}px page gutter`}
                  aria-pressed={preferences.fixedLayoutGutter === value}
                  onClick={() => void reader.setPreferences({ fixedLayoutGutter: value })}
                >
                  {value === 0 ? 'None' : `${value}px`}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
      {showTextSections ? <>
      <div className="epub-settings-panel__section">
        <div className="epub-settings-panel__head">
          <div><span>Display</span><h3>Color theme</h3></div>
          <button type="button" onClick={() => void reader.setPreferences({
            theme: DEFAULT_READER_PREFERENCES.theme,
          })}>Reset</button>
        </div>
        <div className="epub-settings-panel__theme-grid" role="list" aria-label="Theme presets">
          {THEMES.map(theme => (
            <button
              key={theme.value}
              type="button"
              role="listitem"
              className="epub-theme-chip"
              aria-pressed={preferences.theme === theme.value}
              onClick={() => void reader.setPreferences({ theme: theme.value })}
            >
              <span className={`epub-theme-chip__swatch epub-theme-chip__swatch--${theme.value}`} aria-hidden="true" />
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className="epub-settings-panel__section">
        <div className="epub-settings-panel__head">
          <div><span>Reading</span><h3>Typography</h3></div>
          <div className="epub-settings-panel__head-actions">
            <span>{reflowableTypography ? (verticalWriting ? 'Vertical' : 'Horizontal') : 'Fixed'}</span>
            <button type="button" onClick={() => void reader.setPreferences({
              fontFamily: DEFAULT_READER_PREFERENCES.fontFamily,
              fontSizePercent: DEFAULT_READER_PREFERENCES.fontSizePercent,
              lineHeight: DEFAULT_READER_PREFERENCES.lineHeight,
              pageMarginPercent: DEFAULT_READER_PREFERENCES.pageMarginPercent,
            })}>Reset</button>
          </div>
        </div>
        {reflowableTypography ? (
          <TextLayoutPreview
            fontFamily={preferences.fontFamily}
            fontSizePercent={preferences.fontSizePercent}
            lineHeight={preferences.lineHeight}
            marginPercent={preferences.pageMarginPercent}
            theme={preferences.theme}
            vertical={verticalWriting}
          />
        ) : (
          <p className="epub-settings-panel__unavailable">Typography is controlled by this fixed-layout publication.</p>
        )}
        <label className="epub-settings-panel__select-row">
          <span><strong>Font family</strong><small>Overrides the publisher font when supported.</small></span>
          <select
            value={preferences.fontFamily ?? ''}
            disabled={!reflowableTypography}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => void reader.setPreferences({ fontFamily: event.currentTarget.value || null })}
          >
            {FONT_FAMILIES.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="epub-settings-panel__range-field">
          <div className="epub-reader-panel__row">
            <span>Font size</span>
            <output>{preferences.fontSizePercent}%</output>
          </div>
          <input
            type="range"
            min="70"
            max="220"
            step="10"
            value={preferences.fontSizePercent}
            disabled={!reflowableTypography}
            onChange={(event: ChangeEvent<HTMLInputElement>) => void reader.setPreferences({ fontSizePercent: Number(event.currentTarget.value) })}
          />
        </label>
        <label className="epub-settings-panel__range-field">
          <div className="epub-reader-panel__row">
            <span>Line height</span>
            <output>{preferences.lineHeight == null ? 'publisher' : preferences.lineHeight.toFixed(2)}</output>
          </div>
          <input
            type="range"
            min="0.9"
            max="2.4"
            step="0.05"
            value={preferences.lineHeight ?? 1.55}
            disabled={!lineHeightEnabled}
            onChange={(event: ChangeEvent<HTMLInputElement>) => void reader.setPreferences({ lineHeight: Number(event.currentTarget.value) })}
          />
        </label>
        <button className="epub-settings-panel__quiet-action" type="button" disabled={!lineHeightEnabled || preferences.lineHeight == null} onClick={() => void reader.setPreferences({ lineHeight: null })}>Use publisher line height</button>
        <fieldset className="epub-settings-panel__margin" disabled={!reflowableTypography}>
          <legend>{verticalWriting ? 'Top and bottom margins' : 'Page side margins'}</legend>
          <div className="epub-settings-panel__margin-presets">
            {MARGIN_PRESETS.map(preset => (
              <button
                key={preset.value}
                type="button"
                aria-pressed={preferences.pageMarginPercent === preset.value}
                onClick={() => void reader.setPreferences({ pageMarginPercent: preset.value })}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="epub-settings-panel__range-field">
            <div className="epub-reader-panel__row">
              <span>Custom margin</span>
              <output>{preferences.pageMarginPercent}%</output>
            </div>
            <input
              type="range"
              min="0"
              max="18"
              step="2"
              value={preferences.pageMarginPercent}
              onChange={(event: ChangeEvent<HTMLInputElement>) => void reader.setPreferences({ pageMarginPercent: Number(event.currentTarget.value) })}
            />
          </label>
        </fieldset>
      </div>
      </> : null}

      <div className="epub-settings-panel__section">
        <div className="epub-settings-panel__head">
          <div><span>Pages</span><h3>Layout</h3></div>
        </div>
        {showTextSections ? <label className="epub-settings-panel__select-row">
          <span><strong>Flow</strong><small>Choose paging or continuous scrolling.</small></span>
          <select value={preferences.flow} onChange={(event: ChangeEvent<HTMLSelectElement>) => void reader.setPreferences({ flow: event.currentTarget.value as typeof preferences.flow })}>
            <option value="auto">Auto</option>
            <option value="paginated">Paginated</option>
            <option value="scrolled">Scrolled</option>
          </select>
        </label> : null}
        <label className="epub-settings-panel__select-row">
          <span><strong>Spread</strong><small>Show one or two pages when space allows.</small></span>
          <select value={preferences.spread} onChange={(event: ChangeEvent<HTMLSelectElement>) => void reader.setPreferences({ spread: event.currentTarget.value as typeof preferences.spread })}>
            <option value="auto">Auto</option>
            <option value="single">Single page</option>
            <option value="double">Double page</option>
          </select>
        </label>
        <label className="epub-settings-panel__select-row">
          <span><strong>Page direction</strong><small>Override the direction declared by the book.</small></span>
          <select value={preferences.pageProgression} onChange={(event: ChangeEvent<HTMLSelectElement>) => void reader.setPreferences({ pageProgression: event.currentTarget.value as typeof preferences.pageProgression })}>
            <option value="auto">Auto</option>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
        </label>
      </div>

      <div className="epub-settings-panel__section epub-settings-panel__interaction">
        <div className="epub-settings-panel__head">
          <div><span>Controls</span><h3>Touch navigation</h3></div>
          <span>Mobile</span>
        </div>
        <TouchNavigationPreview mode={preferences.touchNavigation} zonePercent={preferences.pageTurnZonePercent} progression={preferences.pageProgression} />
        <fieldset className="epub-settings-panel__segmented">
          <legend>Gestures</legend>
          <div>
            {([
              ['both', 'Tap + swipe'],
              ['tap', 'Tap zones'],
              ['swipe', 'Swipe only'],
              ['off', 'Off'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={preferences.touchNavigation === value} onClick={() => void reader.setPreferences({ touchNavigation: value })}>{label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="epub-settings-panel__segmented">
          <legend>Tap zone width</legend>
          <div>
            {[14, 22, 30, 38].map(value => (
              <button
                key={value}
                type="button"
                disabled={preferences.touchNavigation === 'swipe' || preferences.touchNavigation === 'off'}
                aria-label={`${value}% tap zone width`}
                aria-pressed={preferences.pageTurnZonePercent === value}
                onClick={() => void reader.setPreferences({ pageTurnZonePercent: value })}
              >{value}%</button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="epub-settings-panel__section epub-settings-panel__section--link">
        <button className="epub-settings-panel__advanced-entry" type="button" onClick={() => setAdvanced(true)}>
          <span><strong>Advanced settings</strong><small>Compatibility, local data and troubleshooting</small></span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}

const COMPATIBILITY_GROUPS = [
  {
    title: 'Document parsing',
    items: [
      {
        key: 'recoverContainerStructure',
        label: 'Recover container structure',
        description: 'Recoverable OCF/ZIP deviations → readable EPUB container.',
      },
      {
        key: 'selectPreferredRootfile',
        label: 'Select preferred package',
        description: 'Several rootfiles → the first standard OPF package.',
      },
      {
        key: 'recoverMalformedXhtml',
        label: 'Recover malformed XHTML',
        description: 'Non-well-formed XHTML → browser HTML parsing.',
      },
    ],
  },
  {
    title: 'Navigation',
    items: [
      {
        key: 'useLegacyNavigationFallback',
        label: 'Use legacy navigation',
        description: 'Missing EPUB 3 navigation → EPUB 2 NCX and Guide.',
      },
    ],
  },
  {
    title: 'Layout',
    items: [
      {
        key: 'normalizeLegacyCss',
        label: 'Normalize legacy CSS',
        description: 'Legacy -epub/-webkit declarations → standard CSS.',
      },
      {
        key: 'fitSingleImagePages',
        label: 'Fit single-image pages',
        description: 'Image-only reflowable documents → one contained page.',
      },
    ],
  },
  {
    title: 'Resources',
    items: [
      {
        key: 'deobfuscateIdpfFonts',
        label: 'Decode IDPF fonts',
        description: 'IDPF-obfuscated fonts → browser-loadable fonts.',
      },
    ],
  },
] as const satisfies readonly {
  readonly title: string;
  readonly items: readonly {
    readonly key: keyof ReaderCompatibilityPreferences;
    readonly label: string;
    readonly description: string;
  }[];
}[];

function AdvancedReaderSettings({
  reader,
  preferences,
  onBack,
}: {
  readonly reader: EpubReaderHandle;
  readonly preferences: ReaderCompatibilityPreferences;
  readonly onBack: () => void;
}) {
  const [clearState, setClearState] = useState<'idle' | 'confirm' | 'cleared'>('idle');
  const setCompatibility = (key: keyof ReaderCompatibilityPreferences, enabled: boolean) => void reader.setPreferences({
    compatibility: { [key]: enabled },
  });

  return (
    <section className="epub-reader-panel epub-settings-panel epub-settings-panel--advanced" aria-label="Advanced reader settings">
      <div className="epub-settings-panel__advanced-head">
        <button className="epub-settings-panel__back" type="button" onClick={onBack} aria-label="Back to reader settings">‹</button>
        <div><h3>Advanced settings</h3><span>Compatibility and maintenance</span></div>
      </div>
      <div className="epub-settings-panel__advanced-intro">
        <div><span>Compatibility</span><strong>Publication recovery</strong></div>
        <button type="button" onClick={() => void reader.setPreferences({ compatibility: DEFAULT_READER_COMPATIBILITY_PREFERENCES })}>Restore defaults</button>
        <p>These options are intended for diagnosing unusual EPUB files. Most changes take effect after reopening the book.</p>
      </div>
      {COMPATIBILITY_GROUPS.map(group => (
        <div key={group.title} className="epub-settings-panel__section epub-settings-panel__compatibility-group">
          <h3>{group.title}</h3>
          {group.items.map(item => (
            <label key={item.key} className="epub-settings-panel__compatibility-option">
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences[item.key]}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setCompatibility(item.key, event.currentTarget.checked)}
              />
            </label>
          ))}
        </div>
      ))}
      <div className="epub-settings-panel__section epub-settings-panel__compatibility-group">
        <h3>Core safeguards</h3>
        <p>These rules preserve a valid internal publication model and cannot be disabled.</p>
        <CompatibilitySafeguard label="Rendition declarations" description="Missing or conflicting values → specification defaults or the first valid declaration." />
        <CompatibilitySafeguard label="Publication resource paths" description="base/xml:base, CSS URLs, srcset and SVG references → isolated reader URLs." />
        <CompatibilitySafeguard label="Remote navigation" description="Remote TOC, page-list and landmark targets → readable labels without unsafe internal navigation." />
      </div>
      <div className="epub-settings-panel__section epub-settings-panel__maintenance">
        <div className="epub-settings-panel__head">
          <div><span>Maintenance</span><h3>Local reading data</h3></div>
          <span>Current book</span>
        </div>
        <p>Position, preferences and saved marks are cached locally for this publication. Reopening also rebuilds temporary rendering and resource caches.</p>
        {clearState === 'confirm' ? (
          <div className="epub-settings-panel__clear-confirm" role="group" aria-label="Confirm clearing saved reading data">
            <span>This cannot be undone after the book is closed.</span>
            <div>
              <button type="button" onClick={() => setClearState('idle')}>Cancel</button>
              <button className="is-danger" type="button" onClick={() => {
                reader.clearReadingSession();
                setClearState('cleared');
              }}>Clear data</button>
            </div>
          </div>
        ) : (
          <button className="epub-settings-panel__maintenance-action" type="button" onClick={() => setClearState('confirm')}>
            <span><strong>Clear saved reading data</strong><small>Removes the locally cached session for this book.</small></span>
            <span aria-hidden="true">×</span>
          </button>
        )}
        {clearState === 'cleared' ? <p className="epub-settings-panel__maintenance-status" role="status">Saved reading data cleared.</p> : null}
      </div>
      <div className="epub-settings-panel__apply-bar">
        <span>Apply compatibility changes and reset temporary caches.</span>
        <button className="epub-settings-panel__compatibility-apply" type="button" onClick={() => void reader.retry()}>
          Reopen and reset cache
        </button>
      </div>
    </section>
  );
}

function CompatibilitySafeguard({ label, description }: { readonly label: string; readonly description: string }) {
  return (
    <div className="epub-settings-panel__compatibility-option is-required">
      <span><strong>{label}</strong><small>{description}</small></span>
      <span>Required</span>
    </div>
  );
}

interface TouchNavigationPreviewProps {
  readonly mode: string;
  readonly zonePercent: number;
  readonly progression: string;
}

function TouchNavigationPreview({ mode, zonePercent, progression }: TouchNavigationPreviewProps) {
  const style = { '--touch-zone-width': `${zonePercent}%` } as import('react').CSSProperties;
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

function ComicLayoutPreview({ fit, gutter, spread, progression }: ComicLayoutPreviewProps) {
  const style = { '--comic-preview-gap': `${Math.min(gutter, 24) / 2}px` } as import('react').CSSProperties;
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

function TextLayoutPreview({ fontFamily, fontSizePercent, lineHeight, marginPercent, theme, vertical }: TextLayoutPreviewProps) {
  const style = {
    '--preview-font-family': fontFamily ?? 'Georgia, serif',
    '--preview-font-scale': String(fontSizePercent / 100),
    '--preview-line-height': String(lineHeight ?? 1.55),
    '--preview-margin': `${marginPercent / 2}%`,
  } as import('react').CSSProperties;
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
