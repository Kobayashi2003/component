import { useState, type ChangeEvent } from 'react';
import {
  DEFAULT_READER_COMPATIBILITY_PREFERENCES,
  type ReaderCompatibilityPreferences,
} from '../../../core';
import { ChevronIcon } from '../../chrome/reader-icons';
import type { EpubReaderHandle } from '../../state/model';

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

interface AdvancedReaderSettingsProps {
  readonly rootRef: { current: HTMLElement | null };
  readonly reader: EpubReaderHandle;
  readonly preferences: ReaderCompatibilityPreferences;
  readonly onBack: () => void;
}

export function AdvancedReaderSettings({
  rootRef,
  reader,
  preferences,
  onBack,
}: AdvancedReaderSettingsProps) {
  const [clearState, setClearState] = useState<'idle' | 'confirm' | 'cleared'>('idle');
  const setCompatibility = (key: keyof ReaderCompatibilityPreferences, enabled: boolean) => void reader.setPreferences({
    compatibility: { [key]: enabled },
  });

  return (
    <section ref={rootRef} className="epub-reader-panel epub-settings-panel epub-settings-panel--advanced" aria-label="Advanced reader settings">
      <div className="epub-settings-panel__advanced-head">
        <button className="epub-settings-panel__back" type="button" onClick={onBack} aria-label="Back to reader settings"><ChevronIcon direction="left" /></button>
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
