import type {
  EffectiveSpineRendition,
  Publication,
  SpineItem,
} from './model';

/**
 * Resolve publication-level rendition declarations with one spine item's local
 * overrides. This function has no viewport or user-preference knowledge; that
 * belongs to the future Rendition Planner.
 */
export function resolveSpineRendition(
  publication: Publication,
  item: SpineItem,
): EffectiveSpineRendition {
  return {
    layout: item.rendition.layout ?? publication.rendition.layout,
    orientation: item.rendition.orientation ?? publication.rendition.orientation,
    spread: item.rendition.spread ?? publication.rendition.spread,
    flow: item.rendition.flow ?? publication.rendition.flow,
    pageSpread: item.rendition.pageSpread,
    alignXCenter: item.rendition.alignXCenter ?? false,
  };
}

export function isFixedLayout(
  publication: Publication,
  item: SpineItem,
): boolean {
  return resolveSpineRendition(publication, item).layout === 'pre-paginated';
}

/**
 * A publication is mixed-layout when effective layout changes across its
 * reading order. This is descriptive only; callers must not normalize it away.
 */
export function hasMixedLayout(publication: Publication): boolean {
  let first: EffectiveSpineRendition['layout'] | undefined;

  for (const item of publication.spine) {
    const layout = resolveSpineRendition(publication, item).layout;
    if (first === undefined) first = layout;
    else if (layout !== first) return true;
  }

  return false;
}
