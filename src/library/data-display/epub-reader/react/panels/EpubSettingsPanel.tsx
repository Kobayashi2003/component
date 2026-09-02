import { useRef, useState, type ChangeEvent } from 'react';
import { DEFAULT_READER_PREFERENCES } from '../../core';
import { useOptionalEpubReaderContext } from '../reader/context';
import type { EpubReaderHandle } from '../state/model';
import { AdvancedReaderSettings } from './settings/AdvancedReaderSettings';
import { ComicLayoutPreview, TextLayoutPreview, TouchNavigationPreview } from './settings/ReaderSettingsPreviews';

const FONT_FAMILIES = [
  { value: '', label: 'Publisher default' },
  { value: 'Iowan Old Style, Palatino Linotype, Book Antiqua, Georgia, serif', label: 'Literary serif' },
  { value: 'Georgia, Times New Roman, serif', label: 'Classic serif' },
  { value: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', label: 'Modern sans' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Neutral sans' },
  { value: 'SFMono-Regular, Consolas, Liberation Mono, monospace', label: 'Monospace' },
] as const;

const MARGIN_PRESETS = [
  { value: 0, label: 'Publisher' },
  { value: 6, label: 'Balanced' },
  { value: 12, label: 'Generous' },
] as const;

export function EpubSettingsPanel({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const [advanced, setAdvanced] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubSettingsPanel> requires a reader prop or EpubReaderProvider.');
  const snapshot = reader.state.reader;
  const preferences = snapshot?.preferences ?? reader.state.preferences;
  const navigateToAdvanced = (next: boolean) => {
    const scroller = rootRef.current?.closest<HTMLElement>('.epub-reader-shell__panel-content');
    if (scroller) scroller.scrollTop = 0;
    setAdvanced(next);
  };
  if (advanced && preferences) {
    return (
      <AdvancedReaderSettings
        rootRef={rootRef}
        reader={reader}
        preferences={preferences.compatibility}
        onBack={() => navigateToAdvanced(false)}
      />
    );
  }
  if (!snapshot || !preferences) {
    return (
      <section ref={rootRef} className="epub-reader-panel epub-settings-panel" aria-label="Reader settings">
        {preferences ? (
          <button className="epub-settings-panel__advanced-entry" type="button" onClick={() => navigateToAdvanced(true)}>
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
    <section ref={rootRef} className="epub-reader-panel epub-settings-panel" aria-label="Reader settings">
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
        <div className="epub-settings-panel__theme-grid" role="group" aria-label="Theme presets">
          {snapshot.appearance.themes.map(theme => (
            <button
              key={theme.id}
              type="button"
              className="epub-theme-chip"
              aria-pressed={preferences.theme === theme.id}
              onClick={() => void reader.setPreferences({ theme: theme.id })}
            >
              <span className="epub-theme-chip__swatch" style={theme.preview ? { background: theme.preview } : undefined} aria-hidden="true" />
              {theme.label ?? theme.id}
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
        <button className="epub-settings-panel__advanced-entry" type="button" onClick={() => navigateToAdvanced(true)}>
          <span><strong>Advanced settings</strong><small>Compatibility, local data and troubleshooting</small></span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}
