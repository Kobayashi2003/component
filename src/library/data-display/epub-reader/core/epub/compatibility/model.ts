import type { CompatibilityRepair, PublicationDiagnostic } from '../publication';

export type CompatibilityStatus = 'clean' | 'repaired' | 'degraded' | 'blocked';

export interface AppliedCompatibilityRepair {
  readonly code: string;
  readonly strategy: CompatibilityRepair['strategy'];
  readonly description: CompatibilityRepair['description'];
  readonly confidence?: number;
  readonly resolvesCodes?: readonly string[];
  readonly diagnostic: PublicationDiagnostic;
}

export interface CompatibilityReport {
  readonly status: CompatibilityStatus;
  readonly repairs: readonly AppliedCompatibilityRepair[];
  readonly unresolved: readonly PublicationDiagnostic[];
  readonly warnings: readonly PublicationDiagnostic[];
  readonly infos: readonly PublicationDiagnostic[];
}
