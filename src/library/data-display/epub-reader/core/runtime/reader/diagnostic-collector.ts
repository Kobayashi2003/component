import type { PublicationDiagnostic } from '../../epub/publication';

/** Publication-scoped diagnostic log that suppresses repeat renderer reports. */
export class PublicationDiagnosticCollector {
  private readonly keys = new Set<string>();
  private readonly diagnostics: PublicationDiagnostic[] = [];

  constructor(initial: readonly PublicationDiagnostic[] = []) {
    this.append(initial);
  }

  get all(): readonly PublicationDiagnostic[] {
    return this.diagnostics;
  }

  append(next: readonly PublicationDiagnostic[]): readonly PublicationDiagnostic[] {
    const unique = next.filter(diagnostic => {
      const key = diagnosticKey(diagnostic);
      if (this.keys.has(key)) return false;
      this.keys.add(key);
      return true;
    });
    this.diagnostics.push(...unique);
    return unique;
  }
}

function diagnosticKey(diagnostic: PublicationDiagnostic): string {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.severity,
    diagnostic.phase,
    diagnostic.message,
    diagnostic.path ?? null,
    diagnostic.spineIndex ?? null,
    diagnostic.repair?.strategy ?? null,
  ]);
}
