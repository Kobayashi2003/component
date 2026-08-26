export function publicationProgress(spineIndex: number, spineCount: number): number {
  if (!Number.isInteger(spineCount) || spineCount <= 1) return 0;
  const index = Math.max(0, Math.min(spineCount - 1, spineIndex));
  return index / (spineCount - 1);
}

export function spineIndexForPublicationProgress(progress: number, spineCount: number): number {
  if (!Number.isInteger(spineCount) || spineCount <= 1) return 0;
  const normalized = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return Math.round(normalized * (spineCount - 1));
}
