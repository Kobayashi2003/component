import {
  DEFAULT_READER_PREFERENCES,
  type Locator,
  type PublicationHref,
} from '../../core/epub/publication';
import type { RenditionPlan, RendererKind } from '../../core/presentation/rendition';
import { waitForLayoutStability } from '../../core/presentation/renderer/layout-stability';
import { LayoutTransactionCoordinator } from '../../core/presentation/renderer/layout-transaction';
import { LifecycleScope } from '../../core/presentation/renderer/lifecycle';
import { RendererHost } from '../../core/presentation/renderer/renderer-host';
import type {
  LayoutMeasurement,
  LayoutStabilityReport,
  LayoutStabilityTarget,
  LayoutTransactionContext,
  RendererFactory,
  RendererInstance,
} from '../../core/presentation/renderer/model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Renderer lifecycle test failed: ${message}`);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      const error = signal?.reason instanceof Error ? signal.reason : new Error('aborted');
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function makePlan(
  spineIndex: number,
  renderer: RendererKind = 'reflowable-paginated',
  fontSizePercent = 100,
): RenditionPlan {
  return {
    spineIndex,
    href: `EPUB/ch${spineIndex + 1}.xhtml` as PublicationHref,
    renderer,
    viewport: { width: 800, height: 600 },
    publicationRendition: {
      layout: renderer === 'fixed-layout' ? 'pre-paginated' : 'reflowable',
      orientation: 'auto',
      spread: 'auto',
      flow: renderer === 'reflowable-scroll' ? 'scrolled-doc' : 'paginated',
      alignXCenter: false,
    },
    pageProgression: { value: 'ltr', source: 'publication' },
    overflow: {
      value: renderer === 'fixed-layout'
        ? 'fixed-page'
        : renderer === 'reflowable-scroll'
          ? 'scrolled-doc'
          : 'paginated',
      source: renderer === 'fixed-layout' ? 'layout-requirement' : 'publication',
    },
    writingMode: { value: 'horizontal-tb', source: 'content' },
    textDirection: { value: 'auto', source: 'reading-system-default' },
    orientation: {
      requested: 'auto',
      viewport: 'landscape',
      matchesRequested: true,
      preference: 'any',
    },
    spread: {
      mode: 'single',
      execution: 'single',
      synthetic: false,
      source: 'reading-system-default',
      placement: 'auto',
      gap: 'renderer-default',
    },
    alignXCenter: false,
    preferences: { ...DEFAULT_READER_PREFERENCES, fontSizePercent },
    compatibility: { fitSingleImagePage: false },
    capabilities: {
      textCustomization: {
        fontSize: renderer !== 'fixed-layout',
        fontFamily: renderer !== 'fixed-layout',
        lineHeight: renderer !== 'fixed-layout',
      },
      navigation: {
        paginated: renderer !== 'reflowable-scroll',
        scroll: renderer === 'reflowable-scroll',
        syntheticSpread: true,
      },
      presentation: {
        intrinsicZoom: renderer === 'fixed-layout',
        horizontalCentering: true,
      },
    },
    requirements: {
      intrinsicViewport: renderer === 'fixed-layout' ? 'required' : 'not-required',
      contentPresentationInspection: 'optional',
    },
    diagnostics: [],
  };
}

const stableReport: LayoutStabilityReport = {
  status: 'stable',
  fonts: 'ready',
  images: { requested: 0, decoded: 0, failed: 0, timedOut: false },
  stableFramesObserved: 2,
  measurement: { clientWidth: 800, clientHeight: 600, scrollWidth: 800, scrollHeight: 1200 },
};

async function main(): Promise<void> {

  // 0. Renderer lifetimes abort pending work and clean up in reverse order.
  {
    const scope = new LifecycleScope();
    const cleanupOrder: number[] = [];
    scope.add(() => cleanupOrder.push(1));
    scope.add(() => cleanupOrder.push(2));
    assert(!scope.signal.aborted, 'lifecycle signal starts active');
    scope.dispose();
    assert(scope.signal.aborted, 'disposing lifecycle must abort owned async work');
    assert(cleanupOrder.join(',') === '2,1', 'cleanup must run in reverse acquisition order');
  }

  // 1. Starting generation N+1 aborts N and N can no longer mutate after await.
  {
    const coordinator = new LayoutTransactionCoordinator();
    const mutations: string[] = [];

    const slow = coordinator.run('preferences', async tx => {
      await delay(30, tx.signal);
      tx.mutate(() => mutations.push('slow'));
      return 'slow';
    });

    await delay(1);
    const fast = coordinator.run('preferences', async tx => {
      await delay(2, tx.signal);
      tx.mutate(() => mutations.push('fast'));
      return 'fast';
    });

    const [slowResult, fastResult] = await Promise.all([slow, fast]);
    assert(slowResult.status === 'superseded', 'older transaction must report superseded');
    assert(fastResult.status === 'committed' && fastResult.value === 'fast', 'newer transaction must commit');
    assert(mutations.join(',') === 'fast', 'superseded transaction must not mutate after awaiting');
  }

  // 2. Geometry must settle for consecutive frames after font/image readiness.
  {
    const measurements: LayoutMeasurement[] = [
      { clientWidth: 800, clientHeight: 600, scrollWidth: 800, scrollHeight: 1000 },
      { clientWidth: 800, clientHeight: 600, scrollWidth: 800, scrollHeight: 1100 },
      { clientWidth: 800, clientHeight: 600, scrollWidth: 800, scrollHeight: 1100 },
      { clientWidth: 800, clientHeight: 600, scrollWidth: 800, scrollHeight: 1100 },
    ];
    let index = 0;
    const target: LayoutStabilityTarget = {
      async waitForFonts() {},
      async decodeImages() { return { decoded: 2, failed: 1, total: 3 }; },
      measure() { return measurements[Math.min(index, measurements.length - 1)]!; },
      requestFrame(callback) {
        const timer = setTimeout(() => {
          index += 1;
          callback();
        }, 0);
        return () => clearTimeout(timer);
      },
    };
    const report = await waitForLayoutStability(target, new AbortController().signal, {
      timeoutMs: 200,
      stableFrames: 2,
      waitForFonts: true,
      decodeImages: true,
      observeResize: false,
    });
    assert(report.status === 'stable', 'stable geometry must commit before timeout');
    assert(report.images.requested === 3 && report.images.decoded === 2 && report.images.failed === 1, 'image readiness counts must survive');
    assert(report.measurement.scrollHeight === 1100, 'final stable geometry must be reported');
  }

  // 3. A target that never produces a frame times out instead of hanging forever.
  {
    const target: LayoutStabilityTarget = {
      async waitForFonts() {},
      async decodeImages() { return { decoded: 0, failed: 0, total: 0 }; },
      measure() { return { clientWidth: 1, clientHeight: 1, scrollWidth: 1, scrollHeight: 1 }; },
      requestFrame() { return () => {}; },
    };
    const report = await waitForLayoutStability(target, new AbortController().signal, {
      timeoutMs: 15,
      stableFrames: 2,
      waitForFonts: false,
      decodeImages: false,
      observeResize: false,
    });
    assert(report.status === 'timed-out', 'layout stability must have a finite timeout');
  }

  class FakeRenderer implements RendererInstance {
    disposed = false;
    mountCount = 0;
    updateCount = 0;
    restoreCount = 0;
    committedFontSize = 100;
    visible = true;
    private readonly layoutListeners = new Set<(layout: import('../../core/presentation/renderer/model').RendererLayoutSnapshot) => void>();

    constructor(
      readonly kind: RendererKind,
      private readonly mountDelayMs: number,
      private readonly updateDelayMs: number,
    ) {}

    async mount(plan: RenditionPlan, tx: LayoutTransactionContext): Promise<void> {
      this.mountCount += 1;
      await delay(this.mountDelayMs, tx.signal);
      tx.mutate(() => { this.committedFontSize = plan.preferences.fontSizePercent; });
    }

    async update(plan: RenditionPlan, tx: LayoutTransactionContext): Promise<void> {
      this.updateCount += 1;
      await delay(this.updateDelayMs, tx.signal);
      tx.mutate(() => { this.committedFontSize = plan.preferences.fontSizePercent; });
    }

    async captureLocator(tx: LayoutTransactionContext): Promise<Locator | null> {
      tx.throwIfSuperseded();
      return {
        href: 'EPUB/ch1.xhtml',
        spineIndex: 0,
        locations: { progression: 0.5 },
      };
    }

    async restoreLocator(_locator: Locator, tx: LayoutTransactionContext): Promise<void> {
      tx.throwIfSuperseded();
      this.restoreCount += 1;
    }

    async navigate(
      direction: import('../../core/presentation/renderer/model').ReadingDirection,
      tx: LayoutTransactionContext,
    ): Promise<import('../../core/presentation/renderer/model').RendererNavigationResult> {
      tx.throwIfSuperseded();
      return { status: 'boundary', edge: direction === 'forward' ? 'end' : 'start' };
    }

    async waitForLayoutStable(tx: LayoutTransactionContext): Promise<LayoutStabilityReport> {
      await delay(1, tx.signal);
      tx.throwIfSuperseded();
      return stableReport;
    }

    snapshot() {
      return { pageCount: Math.round(this.committedFontSize / 10), currentPage: 1 };
    }

    onLayoutChange(listener: (layout: import('../../core/presentation/renderer/model').RendererLayoutSnapshot) => void): () => void {
      this.layoutListeners.add(listener);
      return () => this.layoutListeners.delete(listener);
    }

    emitLayout(layout: import('../../core/presentation/renderer/model').RendererLayoutSnapshot): void {
      for (const listener of this.layoutListeners) listener(layout);
    }

    setVisibility(visible: boolean): void {
      this.visible = visible;
    }

    dispose(): void {
      this.disposed = true;
      this.layoutListeners.clear();
    }
  }

  function factory(
    kind: RendererKind,
    created: FakeRenderer[],
    mountDelayMs = 1,
    updateDelayMs = 1,
  ): RendererFactory {
    return {
      kind,
      create() {
        const renderer = new FakeRenderer(kind, mountDelayMs, updateDelayMs);
        created.push(renderer);
        return renderer;
      },
    };
  }

  // 4. Renderer replacement is transactional: an uncommitted candidate is
  // disposed when a newer render supersedes it.
  {
    const paginated: FakeRenderer[] = [];
    const fixed: FakeRenderer[] = [];
    const host = new RendererHost([
      factory('reflowable-paginated', paginated, 30),
      factory('fixed-layout', fixed, 1),
    ]);

    const first = host.present(makePlan(0, 'reflowable-paginated'), 'initial-render');
    await delay(2);
    const second = host.present(makePlan(1, 'fixed-layout'), 'navigation');
    await Promise.all([first, second]);

    assert(paginated.length === 1 && paginated[0]!.disposed, 'superseded renderer candidate must be disposed');
    assert(fixed.length === 1 && !fixed[0]!.disposed, 'winning renderer must remain active');
    assert(host.state.status === 'ready' && host.state.rendererKind === 'fixed-layout', 'host must publish only the newest renderer');
    assert(host.state.plan?.spineIndex === 1, 'host state must point to newest plan');
    host.dispose();
    assert(fixed[0]!.disposed, 'disposing host must dispose active renderer');
  }

  // 4b. Replacement candidates remain visually hidden until the same atomic
  // commit that retires the previously visible renderer.
  {
    const firstSet: FakeRenderer[] = [];
    const secondSet: FakeRenderer[] = [];
    const host = new RendererHost([
      factory('reflowable-paginated', firstSet, 1),
      factory('fixed-layout', secondSet, 20),
    ]);
    await host.present(makePlan(0, 'reflowable-paginated'), 'initial-render');
    const old = firstSet[0]!;
    const replacement = host.present(makePlan(1, 'fixed-layout'), 'navigation');
    await delay(2);
    assert(secondSet[0]?.visible === false, 'replacement renderer must preload hidden');
    assert(!old.disposed && old.visible, 'previous renderer must remain visible until replacement commits');
    await replacement;
    assert(secondSet[0]!.visible, 'winning renderer must become visible at commit');
    assert(old.disposed, 'old renderer must be disposed in the same winning commit');
    host.dispose();
  }


  // 5. Navigation to another spine item replaces the renderer even when the
  // renderer kind is unchanged. Content surfaces are document-lifetime scoped.
  {
    const created: FakeRenderer[] = [];
    const host = new RendererHost([
      factory('reflowable-paginated', created, 1, 1),
    ]);
    await host.present(makePlan(0, 'reflowable-paginated', 100), 'initial-render');
    const firstRenderer = created[0]!;
    await host.present(makePlan(1, 'reflowable-paginated', 100), 'navigation');
    assert(created.length === 2, 'same-kind navigation must create a fresh renderer/document lifetime');
    assert(firstRenderer.disposed, 'previous spine renderer must be disposed after replacement commits');
    assert(created[1]!.restoreCount === 0, 'previous spine locator must not be restored into the new spine item');
    host.dispose();
  }

  // 5a. Renderer topology is part of instance identity. Single-page and
  // cross-spine spread plans can share the same RendererKind but are created by
  // different factory branches, so crossing that boundary must replace.
  {
    const created: FakeRenderer[] = [];
    const host = new RendererHost([factory('reflowable-paginated', created, 1, 1)]);
    const single = makePlan(0, 'reflowable-paginated', 100);
    const cross: RenditionPlan = {
      ...single,
      spread: {
        mode: 'double',
        execution: 'cross-spine',
        synthetic: true,
        source: 'user',
        placement: 'right',
        gap: 'none',
      },
    };
    await host.present(single, 'initial-render');
    const firstRenderer = created[0]!;
    await host.present(cross, 'spread-change');
    assert(created.length === 2, 'single ↔ cross-spine topology change must create a fresh renderer instance');
    assert(firstRenderer.disposed, 'old topology renderer must be disposed after spread replacement commits');
    host.dispose();
  }

  // 5b. Native scroll/live renderer changes publish a fresh layout snapshot
  // without creating a layout/navigation transaction.
  {
    const created: FakeRenderer[] = [];
    const host = new RendererHost([factory('reflowable-scroll', created, 1, 1)]);
    await host.present(makePlan(0, 'reflowable-scroll', 100), 'initial-render');
    created[0]!.emitLayout({ progression: 0.375, measurement: stableReport.measurement });
    assert(host.state.layout?.progression === 0.375, 'live renderer layout changes must update host state');
    host.dispose();
  }

  // 6. Same-content relayouts share a renderer but the old async update may not
  // overwrite the newer preference after it resumes.
  {
    const created: FakeRenderer[] = [];
    const host = new RendererHost([
      factory('reflowable-paginated', created, 1, 20),
    ]);
    await host.present(makePlan(0, 'reflowable-paginated', 100), 'initial-render');
    const renderer = created[0]!;

    const oldUpdate = host.present(makePlan(0, 'reflowable-paginated', 120), 'preferences');
    await delay(1);
    const newUpdate = host.present(makePlan(0, 'reflowable-paginated', 160), 'preferences');
    await Promise.all([oldUpdate, newUpdate]);

    assert(created.length === 1, 'same renderer kind should relayout in place');
    assert(renderer.committedFontSize === 160, 'newest relayout must own the final mutation');
    assert(host.state.plan?.preferences.fontSizePercent === 160, 'host state must publish newest preferences');
    assert(host.state.layout?.pageCount === 16, 'snapshot must be taken after winning update');
    host.dispose();
  }

  console.log('Renderer lifecycle unit test: PASS');
}

void main().catch(error => {
  console.error(error);
  throw error;
});
