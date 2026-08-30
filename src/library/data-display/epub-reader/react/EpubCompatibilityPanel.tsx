import type { AppliedCompatibilityRepair } from '../core';
import { useOptionalEpubReaderContext } from './context';
import type { EpubReaderHandle } from './model';

interface DiagnosticGroup {
  readonly code: string;
  readonly count: number;
  readonly message: string;
  readonly severity: string;
}

interface RepairGroup {
  readonly strategy: string;
  readonly count: number;
  readonly description: string;
}

export function EpubCompatibilityPanel({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubCompatibilityPanel> requires a reader prop or EpubReaderProvider.');

  const snapshot = reader.state.reader;
  if (!snapshot) {
    const groups = groupDiagnostics(reader.state.diagnostics);
    return (
      <section className="epub-reader-panel epub-compatibility-panel" aria-label="EPUB compatibility">
        {groups.length > 0 ? (
          <>
            <header className="epub-compatibility-panel__summary">
              <span className="epub-compatibility-badge is-blocked">Blocked</span>
              <strong>This publication could not be opened.</strong>
              <span>{groups.length} diagnostic group{groups.length === 1 ? '' : 's'}</span>
            </header>
            <DiagnosticGroups groups={groups} open />
          </>
        ) : <p className="epub-reader-panel__empty">No publication diagnostics are available.</p>}
      </section>
    );
  }
  const report = snapshot.compatibility;
  const metadata = snapshot.publication.metadata;
  const groups = groupDiagnostics(snapshot.diagnostics);
  const repairs = groupRepairs(report.repairs);

  return (
    <section className="epub-reader-panel epub-compatibility-panel" aria-label="EPUB compatibility">
      <header className="epub-compatibility-panel__summary">
        <span className={`epub-compatibility-badge is-${report.status}`}>{statusLabel(report.status)}</span>
        <strong>{compatibilityHeadline(report.status)}</strong>
        <span>{report.repairs.length} repairs · {report.warnings.length} warnings · {report.unresolved.length} unresolved</span>
      </header>

      <dl className="epub-book-information">
        {metadata.creators.length > 0 ? <div><dt>Author</dt><dd>{metadata.creators.map(creator => creator.name).join(', ')}</dd></div> : null}
        {metadata.publisher ? <div><dt>Publisher</dt><dd>{metadata.publisher}</dd></div> : null}
        {metadata.language ? <div><dt>Language</dt><dd>{metadata.language}</dd></div> : null}
        <div><dt>Format</dt><dd>EPUB {snapshot.publication.version} · {snapshot.publication.spine.length} sections</dd></div>
      </dl>

      {report.repairs.length > 0 ? (
        <details className="epub-compatibility-panel__details">
          <summary>Applied repairs <span>{repairs.length}</span></summary>
          <ol>
            {repairs.map(repair => (
              <li key={repair.strategy}>
                <strong>{repair.strategy}</strong>
                <span>{repair.description}{repair.count > 1 ? ` Applied ${repair.count} times.` : ''}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {groups.length > 0 ? (
        <DiagnosticGroups groups={groups} />
      ) : null}
    </section>
  );
}

function DiagnosticGroups({ groups, open = false }: { readonly groups: readonly DiagnosticGroup[]; readonly open?: boolean }) {
  return (
    <details className="epub-compatibility-panel__details" open={open}>
      <summary>Technical diagnostics <span>{groups.length}</span></summary>
      <ol>
        {groups.map(group => (
          <li key={group.code}>
            <span className="epub-compatibility-panel__diagnostic-head">
              <code>{group.code}</code>
              <span>{group.count > 1 ? `×${group.count}` : group.severity}</span>
            </span>
            <span>{group.message}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function groupRepairs(repairs: readonly AppliedCompatibilityRepair[]): readonly RepairGroup[] {
  const groups = new Map<string, RepairGroup>();
  for (const repair of repairs) {
    const current = groups.get(repair.strategy);
    groups.set(repair.strategy, current
      ? { ...current, count: current.count + 1 }
      : { strategy: repair.strategy, count: 1, description: repair.description });
  }
  return [...groups.values()];
}

function groupDiagnostics(diagnostics: EpubReaderHandle['state']['diagnostics']): readonly DiagnosticGroup[] {
  const groups = new Map<string, DiagnosticGroup>();
  for (const diagnostic of diagnostics) {
    const current = groups.get(diagnostic.code);
    groups.set(diagnostic.code, current
      ? { ...current, count: current.count + 1 }
      : { code: diagnostic.code, count: 1, message: diagnostic.message, severity: diagnostic.severity });
  }
  return [...groups.values()].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
}

function severityRank(severity: string): number {
  return severity === 'fatal' ? 4 : severity === 'error' ? 3 : severity === 'warning' ? 2 : 1;
}

function statusLabel(status: 'clean' | 'repaired' | 'degraded' | 'blocked'): string {
  return status === 'clean' ? 'Clean' : status === 'repaired' ? 'Repaired' : status === 'degraded' ? 'Degraded' : 'Blocked';
}

function compatibilityHeadline(status: 'clean' | 'repaired' | 'degraded' | 'blocked'): string {
  if (status === 'clean') return 'This publication follows the supported profile.';
  if (status === 'repaired') return 'Compatibility repairs were applied safely.';
  if (status === 'degraded') return 'Some publication features could not be recovered.';
  return 'The publication cannot be opened safely.';
}
