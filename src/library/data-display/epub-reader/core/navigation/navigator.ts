import type { Locator, Publication } from '../publication';
import { locatorAtResourceEnd, locatorAtResourceStart } from '../locator';
import type {
  NavigationDirection,
  NavigationPlanProvider,
  NavigationRendererHost,
  NavigationTarget,
  ReaderNavigationPolicy,
  ReaderNavigationResult,
} from './model';
import { DEFAULT_READER_NAVIGATION_POLICY } from './model';
import { locatorFromCfi, locatorFromHref } from './targets';

/**
 * Publication-level navigation coordinator.
 *
 * Renderers only know how to move inside their currently loaded content. When
 * they report a boundary, this class advances through the EPUB spine and asks
 * the plan provider for the next rendition. Physical left/right controls are
 * intentionally outside this API; they map to forward/backward using the plan's
 * page-progression direction.
 *
 * Navigation is serialized, not latest-wins: two rapid "next" inputs represent
 * two intentional reading steps. Layout transactions remain latest-wins inside
 * RendererHost, but publication navigation preserves user input order.
 */
export class ReaderNavigator {
  private readonly policy: ReaderNavigationPolicy;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly publication: Publication,
    private readonly host: NavigationRendererHost,
    private readonly plans: NavigationPlanProvider,
    policy: Partial<ReaderNavigationPolicy> = {},
  ) {
    this.policy = { ...DEFAULT_READER_NAVIGATION_POLICY, ...policy };
  }

  next(): Promise<ReaderNavigationResult> {
    return this.move('forward');
  }

  previous(): Promise<ReaderNavigationResult> {
    return this.move('backward');
  }

  move(direction: NavigationDirection): Promise<ReaderNavigationResult> {
    return this.enqueue(() => this.performMove(direction));
  }

  goTo(target: NavigationTarget): Promise<Locator | null> {
    return this.enqueue(async () => {
      if ('kind' in target) {
        return target.kind === 'href'
          ? this.performGoToLocator(locatorFromHref(this.publication, target.href))
          : this.performGoToLocator(locatorFromCfi(this.publication, target.cfi));
      }
      return this.performGoToLocator(target);
    });
  }

  goToLocator(locator: Locator): Promise<Locator | null> {
    return this.enqueue(() => this.performGoToLocator(locator));
  }

  private async performMove(direction: NavigationDirection): Promise<ReaderNavigationResult> {
    const currentPlan = this.host.state.plan;
    if (!currentPlan) {
      const first = this.findSequentialSpine(direction === 'forward' ? -1 : this.publication.spine.length, direction);
      if (first == null) return { status: 'boundary', edge: direction === 'forward' ? 'end' : 'start' };
      const locator = direction === 'forward'
        ? locatorAtResourceStart(this.publication, first)
        : locatorAtResourceEnd(this.publication, first);
      await this.performGoToLocator(locator);
      return { status: 'moved', locator: await this.host.captureLocator(), spineChanged: true };
    }

    const within = await this.host.navigateWithin(direction);
    if (within.status === 'moved') {
      return { status: 'moved', locator: await this.host.captureLocator(), spineChanged: false };
    }

    const visible = visibleSpineIndices(this.host.state.layout, currentPlan.spineIndex);
    const adjacentVisible = adjacentVisibleSpine(visible, currentPlan.spineIndex, direction);
    if (adjacentVisible != null) {
      const locator = direction === 'forward'
        ? locatorAtResourceStart(this.publication, adjacentVisible)
        : locatorAtResourceEnd(this.publication, adjacentVisible);
      await this.performGoToLocator(locator);
      return { status: 'moved', locator: await this.host.captureLocator(), spineChanged: true };
    }
    const anchor = direction === 'forward' ? Math.max(...visible) : Math.min(...visible);
    const nextIndex = this.findSequentialSpine(anchor, direction);
    if (nextIndex == null) {
      return { status: 'boundary', edge: direction === 'forward' ? 'end' : 'start' };
    }

    const locator = direction === 'forward'
      ? locatorAtResourceStart(this.publication, nextIndex)
      : locatorAtResourceEnd(this.publication, nextIndex);
    await this.performGoToLocator(locator);
    return { status: 'moved', locator: await this.host.captureLocator(), spineChanged: true };
  }

  private async performGoToLocator(locator: Locator): Promise<Locator | null> {
    const item = this.publication.spine[locator.spineIndex];
    if (!item || item.href !== locator.href) {
      throw new RangeError('Locator does not resolve to this publication spine.');
    }
    const plan = await this.plans.planForSpine(locator.spineIndex);
    if (plan.spineIndex !== locator.spineIndex || plan.href !== locator.href) {
      throw new Error('Navigation plan provider returned a plan for the wrong spine item.');
    }
    await this.host.present(plan, 'navigation', locator);
    return this.host.captureLocator();
  }

  private findSequentialSpine(anchor: number, direction: NavigationDirection): number | null {
    const delta = direction === 'forward' ? 1 : -1;
    for (let index = anchor + delta; index >= 0 && index < this.publication.spine.length; index += delta) {
      const item = this.publication.spine[index]!;
      if (!this.policy.skipNonLinear || item.linear) return index;
    }
    return null;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function adjacentVisibleSpine(
  visible: readonly number[],
  current: number,
  direction: NavigationDirection,
): number | null {
  const candidates = visible.filter(index => direction === 'forward' ? index > current : index < current);
  if (candidates.length === 0) return null;
  return direction === 'forward' ? Math.min(...candidates) : Math.max(...candidates);
}

function visibleSpineIndices(layout: unknown, fallback: number): number[] {
  if (!layout || typeof layout !== 'object') return [fallback];
  const value = layout as {
    spread?: unknown;
    left?: { spineIndex?: unknown } | null;
    right?: { spineIndex?: unknown } | null;
  };
  if (value.spread !== true) return [fallback];
  const indices = [value.left?.spineIndex, value.right?.spineIndex]
    .filter((index): index is number => Number.isInteger(index));
  return indices.length > 0 ? indices : [fallback];
}
