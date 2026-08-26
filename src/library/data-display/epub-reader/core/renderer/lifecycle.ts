import { createAbortError } from './abort';

export type Cleanup = () => void;

/**
 * Small deterministic cleanup scope for renderer/surface lifetimes. It owns an
 * AbortSignal plus arbitrary cleanups such as DOM listeners/observers/timers.
 */
export class LifecycleScope {
  private readonly controller = new AbortController();
  private readonly cleanups: Cleanup[] = [];
  private disposed = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  add(cleanup: Cleanup): Cleanup {
    if (this.disposed) {
      cleanup();
      return () => {};
    }
    let active = true;
    const wrapped = () => {
      if (!active) return;
      active = false;
      cleanup();
    };
    this.cleanups.push(wrapped);
    return wrapped;
  }

  listen(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): Cleanup {
    target.addEventListener(type, listener, options);
    return this.add(() => target.removeEventListener(type, listener, options));
  }

  dispose(reason = 'Lifecycle disposed.'): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort(createAbortError(reason));

    // Reverse order mirrors resource acquisition and avoids parent resources
    // disappearing before child listeners/observers have detached.
    for (let index = this.cleanups.length - 1; index >= 0; index -= 1) {
      try {
        this.cleanups[index]!();
      } catch {
        // Cleanup is best-effort; one faulty disposer must not leak the rest.
      }
    }
    this.cleanups.length = 0;
  }
}
