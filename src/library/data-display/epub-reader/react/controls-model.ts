/**
 * Publication-scoped reading progress.
 *
 * `sectionProgression` is how far the reader is through the current spine item.
 * Leaving it at 0 gives the pure fixed-layout answer, where every section is
 * exactly one page and the section index alone is the position. Passing it
 * matters for mixed-layout books: those spend a dozen turns in single-page
 * plates and front matter, and a section-scoped bar sits at 0% through all of
 * them because a one-page section is never partway through itself.
 */
export function publicationProgress(spineIndex: number, spineCount: number, sectionProgression = 0): number {
  if (!Number.isInteger(spineCount) || spineCount <= 1) return 0;
  const index = clamp(spineIndex, 0, spineCount - 1);
  const within = clamp(sectionProgression, 0, 1);
  return Math.min(1, (index + within) / (spineCount - 1));
}

/** Inverse of {@link publicationProgress} with `sectionProgression` left at 0. */
export function spineIndexForPublicationProgress(progress: number, spineCount: number): number {
  if (!Number.isInteger(spineCount) || spineCount <= 1) return 0;
  return Math.round(clamp(progress, 0, 1) * (spineCount - 1));
}

/** Inverse of {@link publicationProgress}, recovering the position within the section too. */
export function locationForPublicationProgress(
  progress: number,
  spineCount: number,
): { readonly spineIndex: number; readonly progression: number } {
  if (!Number.isInteger(spineCount) || spineCount <= 1) {
    return { spineIndex: 0, progression: clamp(progress, 0, 1) };
  }
  const scaled = clamp(progress, 0, 1) * (spineCount - 1);
  const spineIndex = Math.min(spineCount - 1, Math.floor(scaled));
  return { spineIndex, progression: clamp(scaled - spineIndex, 0, 1) };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
