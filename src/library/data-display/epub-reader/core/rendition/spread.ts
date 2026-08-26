import type {
  EffectiveSpineRendition,
  PageSpread,
  Publication,
  PublicationDiagnostic,
  ReaderPreferences,
  SpineItem,
  ContentPresentationHints,
} from '../publication';
import { resolveSpineRendition } from '../publication';
import type {
  OverflowMode,
  RenditionPlannerPolicy,
  SpreadPairHint,
  SpreadPlan,
  ViewportMetrics,
  ViewportOrientation,
} from './model';

export function getViewportOrientation(viewport: ViewportMetrics): ViewportOrientation {
  if (viewport.width > viewport.height) return 'landscape';
  if (viewport.height > viewport.width) return 'portrait';
  return 'square';
}

export interface SpreadResolution {
  readonly spread: SpreadPlan;
  readonly diagnostics: readonly PublicationDiagnostic[];
}

export function resolveSpread(
  publication: Publication,
  item: SpineItem,
  rendition: EffectiveSpineRendition,
  overflow: OverflowMode,
  preferences: ReaderPreferences,
  viewport: ViewportMetrics,
  policy: RenditionPlannerPolicy,
  contentHints?: ContentPresentationHints,
): SpreadResolution {
  const placement = rendition.pageSpread ?? 'auto';
  const trueSpread = detectTrueSpreadPair(publication, item);

  // Synthetic spreads are a paginated concept. The authored placement remains
  // preserved on the plan but does not affect a scrolled rendition.
  if (overflow === 'scrolled-doc' || overflow === 'scrolled-continuous') {
    return {
      spread: {
        mode: 'single',
        execution: 'single',
        synthetic: false,
        source: 'layout-requirement',
        placement,
        trueSpread,
        gap: 'renderer-default',
      },
      diagnostics: [],
    };
  }

  // page-spread-center is defined as a per-item spread-none alias.
  if (rendition.pageSpread === 'center') {
    return {
      spread: {
        mode: 'single',
        execution: 'single',
        synthetic: false,
        source: 'spread-placement',
        placement: 'center',
        trueSpread,
        gap: 'renderer-default',
      },
      diagnostics: [],
    };
  }

  // rendition:spread=none is normative: do not incorporate this item in a
  // synthetic spread, even when the user globally prefers double-page mode.
  if (rendition.spread === 'none') {
    const diagnostics: PublicationDiagnostic[] = [];
    if (preferences.spread === 'double') {
      diagnostics.push({
        code: 'RENDITION_USER_SPREAD_BLOCKED_BY_PUBLICATION_NONE',
        severity: 'info',
        phase: 'rendition',
        spineIndex: item.index,
        message: 'The publication declares rendition:spread=none for this spine item; the user double-page preference is not applied.',
      });
    }
    return {
      spread: {
        mode: 'single',
        execution: 'single',
        synthetic: false,
        source: item.rendition.spread != null ? 'spine' : 'publication',
        placement,
        trueSpread,
        gap: 'renderer-default',
      },
      diagnostics,
    };
  }

  if (!policy.syntheticSpreads.supported) {
    const diagnostics: PublicationDiagnostic[] = [];
    if (preferences.spread === 'double' || rendition.spread === 'both' || rendition.spread === 'portrait') {
      diagnostics.push({
        code: 'RENDITION_SYNTHETIC_SPREAD_UNSUPPORTED',
        severity: 'warning',
        phase: 'rendition',
        spineIndex: item.index,
        message: 'A synthetic spread was requested, but the active reading-system policy does not support synthetic spreads.',
      });
    }
    return {
      spread: {
        mode: 'single',
        execution: 'single',
        synthetic: false,
        source: 'reading-system-default',
        placement,
        trueSpread,
        gap: 'renderer-default',
      },
      diagnostics,
    };
  }

  if (preferences.spread === 'single') {
    return {
      spread: makeDoubleAwarePlan(false, 'user', placement, trueSpread, rendition.layout, contentHints),
      diagnostics: [],
    };
  }

  if (preferences.spread === 'double') {
    return {
      spread: makeDoubleAwarePlan(true, 'user', placement, trueSpread, rendition.layout, contentHints),
      diagnostics: [],
    };
  }

  if (trueSpread) {
    const hasRoom = viewport.width >= policy.syntheticSpreads.minViewportWidth
      && viewport.width / 2 >= policy.syntheticSpreads.minPageWidth;
    return {
      spread: makeDoubleAwarePlan(hasRoom, 'spread-placement', placement, trueSpread, rendition.layout, contentHints),
      diagnostics: [],
    };
  }

  const orientation = getViewportOrientation(viewport);
  if (rendition.spread === 'both' || rendition.spread === 'portrait') {
    return {
      spread: makeDoubleAwarePlan(
        true,
        item.rendition.spread != null ? 'spine' : 'publication',
        placement,
        trueSpread,
        rendition.layout,
        contentHints,
      ),
      diagnostics: [],
    };
  }

  if (rendition.spread === 'landscape') {
    return {
      spread: makeDoubleAwarePlan(
        orientation === 'landscape',
        item.rendition.spread != null ? 'spine' : 'publication',
        placement,
        trueSpread,
        rendition.layout,
        contentHints,
      ),
      diagnostics: [],
    };
  }

  const useAutoSpread = shouldUseAutomaticSpread(viewport, policy);
  return {
    spread: makeDoubleAwarePlan(
      useAutoSpread,
      'reading-system-default',
      placement,
      trueSpread,
      rendition.layout,
      contentHints,
    ),
    diagnostics: [],
  };
}

function makeDoubleAwarePlan(
  useDouble: boolean,
  source: SpreadPlan['source'],
  placement: PageSpread | 'auto',
  trueSpread: SpreadPairHint | undefined,
  layout: EffectiveSpineRendition['layout'],
  contentHints?: ContentPresentationHints,
): SpreadPlan {
  const page = contentHints?.page;
  const execution = !useDouble
    ? 'single'
    : layout === 'reflowable' && page?.likelySpanningSpread
      ? 'spanning-document'
      : layout === 'reflowable' && page?.pageLike
        ? 'cross-spine'
        : layout === 'reflowable'
          ? 'intra-document'
          : 'cross-spine';
  return {
    mode: useDouble ? 'double' : 'single',
    execution,
    synthetic: useDouble,
    source,
    placement,
    trueSpread,
    gap:
      useDouble && (layout === 'pre-paginated' || trueSpread !== undefined || execution === 'spanning-document')
        ? 'none'
        : 'renderer-default',
  };
}

function shouldUseAutomaticSpread(
  viewport: ViewportMetrics,
  policy: RenditionPlannerPolicy,
): boolean {
  const { autoMode, minViewportWidth, minPageWidth } = policy.syntheticSpreads;
  if (autoMode === 'never') return false;
  if (viewport.width < minViewportWidth) return false;
  if (viewport.width / 2 < minPageWidth) return false;

  if (autoMode === 'landscape-when-room') {
    return getViewportOrientation(viewport) === 'landscape';
  }

  return true;
}

export function detectTrueSpreadPair(
  publication: Publication,
  item: SpineItem,
): SpreadPairHint | undefined {
  const activePlacement = resolveSpineRendition(publication, item).pageSpread;
  if (activePlacement !== 'left' && activePlacement !== 'right') return undefined;
  const progression = publication.pageProgressionDirection === 'rtl' ? 'rtl' : 'ltr';
  const firstPlacement: PageSpread = progression === 'rtl' ? 'right' : 'left';
  const neighborIndex = item.index + (activePlacement === firstPlacement ? 1 : -1);
  const neighbor = publication.spine[neighborIndex];
  if (!neighbor) return undefined;
  const neighborPlacement = resolveSpineRendition(publication, neighbor).pageSpread;
  if (!areComplementary(activePlacement, neighborPlacement)) return undefined;

  return activePlacement === 'left'
    ? { leftSpineIndex: item.index, rightSpineIndex: neighbor.index }
    : { leftSpineIndex: neighbor.index, rightSpineIndex: item.index };
}

function areComplementary(a: PageSpread, b: PageSpread | undefined): boolean {
  return (a === 'left' && b === 'right') || (a === 'right' && b === 'left');
}
