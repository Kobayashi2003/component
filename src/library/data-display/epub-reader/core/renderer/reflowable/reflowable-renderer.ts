import {
  BrowserDomXmlPlatform,
  materializeXhtmlSpineItem,
  type BrowserXmlPlatform,
} from '../../content';
import type { ContentPresentationHints, Locator, Publication } from '../../publication';
import { createCompositeLocator, resolveCompositeLocator } from '../../locator';
import type { RenditionPlan, RendererKind } from '../../rendition';
import type { PublicationResourceSession } from '../../resources';
import { BrowserIFrameContentSurface } from '../browser-iframe-surface';
import { LifecycleScope } from '../lifecycle';
import type {
  ContentSurface,
  LayoutStabilityReport,
  LayoutTransactionContext,
  RendererFactory,
  RendererInstance,
} from '../model';
import {
  findVisibleDomPoint,
  inspectComputedPresentation,
  navigateReflowable,
  restoreDomPoint,
  restoreProgression,
  snapshotReflowableLayout,
} from './dom';
import {
  DEFAULT_REFLOWABLE_RENDERER_POLICY,
  type ReflowablePresentation,
  type ReflowableRendererKind,
  type ReflowableRendererPolicy,
} from './model';
import {
  buildReaderPreferenceCss,
  buildReflowableLayoutCss,
  READER_LAYOUT_STYLE_ID,
  READER_PREFERENCES_STYLE_ID,
  removeReaderStyle,
  upsertReaderStyle,
} from './styles';

export interface ReflowableRendererEnvironment {
  readonly container: HTMLElement;
  readonly publication: Publication;
  readonly resources: PublicationResourceSession;
  readonly policy?: ReflowableRendererPolicy;
  readonly createSurface?: () => ContentSurface;
  readonly xmlPlatform?: BrowserXmlPlatform;
  readonly onDiagnostics?: (diagnostics: readonly import('../../publication').PublicationDiagnostic[]) => void;
  readonly themeResolver?: import('../../appearance').ReaderThemeResolver;
  /** Feed document-derived presentation facts back to the future controller/planner loop. */
  readonly onPresentationHints?: (hints: ContentPresentationHints) => void;
}

/** Factories for both concrete reflowable renderer kinds. */
export function createReflowableRendererFactories(
  environment: ReflowableRendererEnvironment,
): readonly RendererFactory[] {
  return [
    makeFactory('reflowable-paginated', environment),
    makeFactory('reflowable-scroll', environment),
  ];
}

function makeFactory(
  kind: ReflowableRendererKind,
  environment: ReflowableRendererEnvironment,
): RendererFactory {
  return {
    kind,
    create: () => new ReflowableRenderer(kind, environment),
  };
}

export class ReflowableRenderer implements RendererInstance {
  readonly kind: RendererKind;

  private readonly lifecycle = new LifecycleScope();
  private readonly policy: ReflowableRendererPolicy;
  private surface: ContentSurface | null = null;
  private document: Document | null = null;
  private plan: RenditionPlan | null = null;
  private presentation: ReflowablePresentation | null = null;
  private visible = true;
  private disposed = false;
  private readonly layoutListeners = new Set<(layout: import('../model').RendererLayoutSnapshot) => void>();
  private cancelLayoutFrame: (() => void) | null = null;

  constructor(
    kind: ReflowableRendererKind,
    private readonly environment: ReflowableRendererEnvironment,
  ) {
    this.kind = kind;
    this.policy = environment.policy ?? DEFAULT_REFLOWABLE_RENDERER_POLICY;
  }

  async mount(plan: RenditionPlan, transaction: LayoutTransactionContext): Promise<void> {
    this.assertAlive();
    this.assertPlan(plan);
    if (this.surface) throw new Error('ReflowableRenderer.mount() can only be called once.');

    const item = this.environment.publication.spine[plan.spineIndex];
    if (!item || item.href !== plan.href) {
      throw new Error(`Rendition plan does not resolve to spine item ${plan.spineIndex}.`);
    }

    const ownerDocument = this.environment.container.ownerDocument;
    const platform = this.environment.xmlPlatform ?? new BrowserDomXmlPlatform(ownerDocument);
    const materialized = await materializeXhtmlSpineItem(
      item,
      this.environment.resources,
      platform,
      { disableScripts: true, annotateLinks: true },
    );
    transaction.throwIfSuperseded();
    this.environment.onDiagnostics?.(materialized.diagnostics);
    if (plan.overflow.value === 'scrolled-continuous') {
      this.environment.onDiagnostics?.([{
        code: 'RENDITION_CONTINUOUS_SCROLL_COORDINATOR_PENDING',
        severity: 'info',
        phase: 'rendition',
        spineIndex: plan.spineIndex,
        message: 'The reflowable surface renders this spine item as a scrollable document; cross-spine continuous stitching is a higher-level navigation responsibility and is not active yet.',
      }]);
    }
    this.environment.onPresentationHints?.(materialized.hints);

    const surface = this.environment.createSurface?.()
      ?? new BrowserIFrameContentSurface(ownerDocument, { title: `EPUB: ${item.href}` });
    let mounted = false;
    try {
      transaction.mutate(() => {
        prepareReflowableContainer(this.environment.container);
        surface.mount(this.environment.container);
        prepareReflowableSurface(surface.element);
        surface.element.style.visibility = this.visible ? 'visible' : 'hidden';
        this.surface = surface;
        mounted = true;
      });

      const loaded = await surface.load({
        kind: 'url',
        url: materialized.url,
        srcdocFallback: { html: materialized.markup },
      }, transaction.signal);
      transaction.throwIfSuperseded();

      transaction.mutate(() => {
        this.document = loaded.document;
        this.plan = plan;
        this.applyPlan(plan);
        this.installNavigationGuard(loaded.document);
        this.installFormGuard(loaded.document);
        this.installLiveLayoutReporting(loaded.document);
      });
    } catch (error) {
      if (mounted) surface.dispose();
      if (this.surface === surface) this.surface = null;
      throw error;
    }
  }

  async update(plan: RenditionPlan, transaction: LayoutTransactionContext): Promise<void> {
    this.assertAlive();
    this.assertPlan(plan);
    if (!this.document || !this.plan) throw new Error('ReflowableRenderer must be mounted before update().');
    if (this.plan.spineIndex !== plan.spineIndex || this.plan.href !== plan.href) {
      throw new Error('ReflowableRenderer cannot update to a different spine document.');
    }

    transaction.mutate(() => {
      this.plan = plan;
      this.applyPlan(plan);
    });
  }

  async captureLocator(transaction: LayoutTransactionContext): Promise<Locator | null> {
    this.assertAlive();
    transaction.throwIfSuperseded();
    const document = this.document;
    const plan = this.plan;
    if (!document || !plan) return null;
    const presentation = this.presentation ?? inspectComputedPresentation(document, plan);
    const snapshot = snapshotReflowableLayout(document, plan, presentation, this.policy);
    const point = findVisibleDomPoint(document, presentation);
    if (!point) {
      return { href: plan.href, spineIndex: plan.spineIndex, locations: { progression: snapshot.progression } };
    }
    return createCompositeLocator(
      document,
      this.environment.publication,
      plan.spineIndex,
      plan.href,
      snapshot.progression,
      point,
      this.policy.locatorTextLength,
    );
  }

  async restoreLocator(locator: Locator, transaction: LayoutTransactionContext): Promise<void> {
    this.assertAlive();
    transaction.throwIfSuperseded();
    const document = this.document;
    const plan = this.plan;
    if (!document || !plan) return;
    if (locator.spineIndex !== plan.spineIndex || locator.href !== plan.href) return;

    transaction.mutate(() => {
      const presentation = this.presentation ?? inspectComputedPresentation(document, plan);
      const resolved = resolveCompositeLocator(document, this.environment.publication, plan.spineIndex, locator);
      if (resolved.point) restoreDomPoint(document, plan, presentation, this.policy, resolved.point);
      else restoreProgression(document, plan, presentation, this.policy, resolved.progression ?? 0);
    });
  }


  async navigate(
    direction: import('../model').ReadingDirection,
    transaction: LayoutTransactionContext,
  ): Promise<import('../model').RendererNavigationResult> {
    this.assertAlive();
    transaction.throwIfSuperseded();
    const document = this.document;
    const plan = this.plan;
    if (!document || !plan) return { status: 'boundary', edge: direction === 'forward' ? 'end' : 'start' };
    return transaction.mutate(() => {
      const presentation = this.presentation ?? inspectComputedPresentation(document, plan);
      return navigateReflowable(document, plan, presentation, this.policy, direction);
    });
  }

  async waitForLayoutStable(transaction: LayoutTransactionContext): Promise<LayoutStabilityReport> {
    this.assertAlive();
    const surface = this.surface;
    if (!surface) throw new Error('ReflowableRenderer has no content surface.');
    const report = await surface.waitForLayoutStable(transaction.signal);
    transaction.throwIfSuperseded();

    // Vertical writing used to need a second pass here: the reader measured the
    // authored extent itself, padded the body out to a whole spread and waited
    // for the browser again. CSS fragmentation makes both unnecessary — the
    // column boxes are the pages, and their count is read straight back off the
    // scrolling box like it already was for horizontal writing.
    transaction.mutate(() => {
      if (!this.document || !this.plan) return;
      this.presentation = inspectComputedPresentation(this.document, this.plan);
      this.environment.onPresentationHints?.({
        writingMode: this.presentation.writingMode,
        direction: this.presentation.textDirection,
      });
    });
    return report;
  }

  contentDocuments(): readonly import('../model').RendererContentDocument[] {
    if (!this.document || !this.plan || !this.surface) return [];
    return [{ spineIndex: this.plan.spineIndex, href: this.plan.href, document: this.document, surfaceElement: this.surface.element }];
  }

  onLayoutChange(listener: (layout: import('../model').RendererLayoutSnapshot) => void): () => void {
    this.layoutListeners.add(listener);
    return () => this.layoutListeners.delete(listener);
  }

  snapshot() {
    this.assertAlive();
    if (!this.document || !this.plan) return {};
    const presentation = this.presentation ?? inspectComputedPresentation(this.document, this.plan);
    return snapshotReflowableLayout(this.document, this.plan, presentation, this.policy);
  }

  setVisibility(visible: boolean): void {
    this.visible = visible;
    if (this.surface) this.surface.element.style.visibility = visible ? 'visible' : 'hidden';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLayoutFrame?.();
    this.cancelLayoutFrame = null;
    this.layoutListeners.clear();
    this.lifecycle.dispose('Reflowable renderer disposed.');
    this.surface?.dispose();
    this.surface = null;
    this.document = null;
    this.plan = null;
    this.presentation = null;
  }

  private applyPlan(plan: RenditionPlan): void {
    const document = this.document;
    if (!document) throw new Error('Cannot apply a reflowable plan before its document is loaded.');

    // User typography can influence computed presentation (for example a
    // user font can change metrics), but must not overwrite writing-mode or
    // direction. Inspect after preferences, then choose the execution model from
    // the actual computed writing mode rather than the provisional planner fallback.
    upsertReaderStyle(
      document,
      READER_PREFERENCES_STYLE_ID,
      buildReaderPreferenceCss(plan, this.environment.themeResolver?.resolve(plan.preferences.theme)),
    );
    this.presentation = inspectComputedPresentation(document, plan);
    upsertReaderStyle(
      document,
      READER_LAYOUT_STYLE_ID,
      buildReflowableLayoutCss(plan, this.policy, this.presentation.writingMode),
    );
  }

  private installLiveLayoutReporting(document: Document): void {
    this.lifecycle.listen(document, 'scroll', () => {
      if (this.cancelLayoutFrame || this.disposed) return;
      const win = document.defaultView;
      if (!win) return;
      const frame = win.requestAnimationFrame(() => {
        this.cancelLayoutFrame = null;
        if (this.disposed || !this.document || !this.plan) return;
        const layout = this.snapshot();
        for (const listener of this.layoutListeners) listener(layout);
      });
      this.cancelLayoutFrame = () => win.cancelAnimationFrame(frame);
    }, true);
  }

  private installNavigationGuard(document: Document): void {
    this.lifecycle.listen(document, 'click', event => {
      const target = event.target;
      if (!target || (target as Node).nodeType !== 1) return;
      const anchor = (target as Element).closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('#')) return;

      // Cross-document navigation is a ReaderNavigator responsibility. Do not let
      // the iframe replace its one-document lifetime behind the engine.
      event.preventDefault();
    }, true);
  }


  private installFormGuard(document: Document): void {
    this.lifecycle.listen(document, 'submit', event => {
      // A form navigation would replace the iframe document and violate the
      // one-surface/one-document lifetime. Form interaction can be routed by a
      // future scripted-content/controller capability instead.
      event.preventDefault();
    }, true);
  }

  private assertPlan(plan: RenditionPlan): void {
    if (plan.renderer !== this.kind) {
      throw new Error(`Renderer ${this.kind} received incompatible plan ${plan.renderer}.`);
    }
    if (plan.publicationRendition.layout !== 'reflowable') {
      throw new Error(`Renderer ${this.kind} cannot render pre-paginated content.`);
    }
    if (plan.spread.execution === 'cross-spine') {
      throw new Error('Cross-spine spreads must be executed by the spread compositor.');
    }
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('ReflowableRenderer has been disposed.');
  }
}

function prepareReflowableContainer(container: HTMLElement): void {
  if (!container.style.position) container.style.position = 'relative';
  container.style.overflow = 'hidden';
  // The container outlives any one renderer. A fixed-layout renderer that ran
  // before this one leaves its own scroll settings behind, so every property it
  // writes has to be restated here rather than only the ones that differ.
  container.style.overscrollBehavior = 'contain';
}

function prepareReflowableSurface(element: HTMLElement): void {
  element.style.position = 'absolute';
  element.style.inset = '0';
  element.style.width = '100%';
  element.style.height = '100%';
}
