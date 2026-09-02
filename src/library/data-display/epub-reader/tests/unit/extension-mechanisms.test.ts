import {
  ActiveExtensionLifecycle,
  CapabilityRegistry,
  CircularExtensionDependencyError,
  DuplicateCapabilityError,
  DuplicateExtensionIdError,
  DuplicateObserverIdError,
  EventDispatcher,
  LifecycleScope,
  MissingCapabilityError,
  RequiredExtensionStartError,
  defineCapability,
  orderExtensions,
  startLifecycleModules,
  type LifecycleModule,
  type ObserverFailure,
} from '../../core/extension';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Extension mechanisms unit test failed: ${message}`);
}

async function main(): Promise<void> {
  // LifecycleScope aborts first, cleans up in reverse order, and isolates bad cleanup.
  {
    const scope = new LifecycleScope();
    const log: string[] = [];
    scope.add(() => log.push('first'));
    scope.add(() => { log.push('faulty'); throw new Error('cleanup failed'); });
    scope.add(() => log.push('last'));
    scope.dispose();
    scope.dispose();
    scope.add(() => log.push('late'));
    assert(scope.signal.aborted && scope.disposed, 'disposed scopes must abort pending work');
    assert(log.join(',') === 'last,faulty,first,late', 'cleanup must be reverse ordered, isolated, idempotent, and immediate after disposal');
  }

  // Capability keys preserve type information and one owner cannot replace another.
  {
    interface SearchCapability { run(query: string): number }
    const search = defineCapability<SearchCapability>('reader.search');
    const missing = defineCapability<{ value: string }>('reader.missing');
    const registry = new CapabilityRegistry();
    const unregister = registry.register('builtin.search', search, { run: query => query.length });
    assert(registry.has(search) && registry.require(search).run('epub') === 4, 'registered capabilities must resolve through their typed key');
    assert(registry.ownerOf(search) === 'builtin.search' && registry.ids().join(',') === 'reader.search', 'capability ownership must remain inspectable');
    assertThrows(() => registry.register('other.search', search, { run: () => 0 }), DuplicateCapabilityError, 'duplicate capability providers must be rejected');
    assertThrows(() => registry.require(missing), MissingCapabilityError, 'required missing capabilities must fail explicitly');
    unregister();
    unregister();
    assert(!registry.has(search) && registry.size === 0, 'capability cleanup must be idempotent');
  }

  // Dependency order is stable and publication feature cleanup is reversed.
  {
    const log: string[] = [];
    const modules: readonly LifecycleModule<string[]>[] = [
      feature('feature.reader', ['feature.index'], log),
      feature('feature.index', [], log),
      feature('feature.unrelated', [], log),
    ];
    const ordered = orderExtensions(modules);
    assert(ordered.map(module => module.id).join(',') === 'feature.index,feature.reader,feature.unrelated', 'dependencies must start first and independent registration order must remain stable');
    const lifecycle = await startLifecycleModules(modules, log);
    assert(lifecycle instanceof ActiveExtensionLifecycle, 'successful startup must return an active lifecycle owner');
    assert(lifecycle.startedIds.join(',') === 'feature.index,feature.reader,feature.unrelated', 'started ids must expose deterministic startup order');
    lifecycle.dispose();
    assert(log.join(',') === 'start:feature.index,start:feature.reader,start:feature.unrelated,stop:feature.unrelated,stop:feature.reader,stop:feature.index', 'feature cleanup must reverse successful startup order');
  }

  // Optional failures and their dependants are isolated; unrelated work continues.
  {
    const log: string[] = [];
    const reported: string[] = [];
    const lifecycle = await startLifecycleModules<string[]>([
      {
        id: 'feature.optional-failure',
        failureMode: 'optional',
        start(_context, scope) {
          scope.add(() => log.push('rollback:optional-failure'));
          throw new Error('optional failed');
        },
      },
      {
        id: 'feature.optional-dependent',
        dependencies: ['feature.optional-failure'],
        failureMode: 'optional',
        start() { log.push('must-not-start'); },
      },
      feature('feature.healthy', [], log),
    ], log, {
      onOptionalFailure(failure) { reported.push(`${failure.extensionId}:${failure.kind}`); },
    });
    assert(lifecycle.startedIds.join(',') === 'feature.healthy', 'only healthy optional/unrelated features may become active');
    assert(lifecycle.failures.length === 2, 'both the failed optional feature and unavailable dependant must remain observable');
    assert(reported.join(',') === 'feature.optional-failure:start-failed,feature.optional-dependent:dependency-unavailable', 'optional failure reporting must preserve deterministic order and cause kind');
    lifecycle.dispose();
    assert(log.join(',') === 'rollback:optional-failure,start:feature.healthy,stop:feature.healthy', 'failed feature resources must roll back before startup continues');
  }

  // A required failure rolls back everything that started before it.
  {
    const log: string[] = [];
    let error: unknown;
    try {
      await startLifecycleModules<string[]>([
        feature('feature.started', [], log),
        {
          id: 'feature.required-failure',
          start(_context, scope) {
            scope.add(() => log.push('rollback:required-failure'));
            throw new Error('required failed');
          },
        },
      ], log);
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof RequiredExtensionStartError && error.extensionId === 'feature.required-failure', 'required startup errors must identify the failing extension');
    assert(log.join(',') === 'start:feature.started,rollback:required-failure,stop:feature.started', 'required failure must roll back local and previously started resources');
  }

  // Invalid registries fail before any module can start.
  {
    let starts = 0;
    const duplicate: readonly LifecycleModule<void>[] = [
      { id: 'feature.same', start() { starts += 1; } },
      { id: 'feature.same', start() { starts += 1; } },
    ];
    await assertRejects(() => startLifecycleModules(duplicate, undefined), DuplicateExtensionIdError, 'duplicate feature ids must fail registry validation');
    const cyclic: readonly LifecycleModule<void>[] = [
      { id: 'feature.a', dependencies: ['feature.b'], start() { starts += 1; } },
      { id: 'feature.b', dependencies: ['feature.a'], start() { starts += 1; } },
    ];
    await assertRejects(() => startLifecycleModules(cyclic, undefined), CircularExtensionDependencyError, 'dependency cycles must fail registry validation');
    assert(starts === 0, 'invalid registries must not produce partial startup side effects');
  }

  // Missing dependencies obey the same explicit required/optional policy.
  {
    let optionalStarts = 0;
    const optional = await startLifecycleModules<void>([{
      id: 'feature.optional-missing',
      dependencies: ['feature.not-registered'],
      failureMode: 'optional',
      start() { optionalStarts += 1; },
    }], undefined);
    assert(optionalStarts === 0 && optional.failures[0]?.kind === 'dependency-unavailable', 'an optional feature with a missing dependency must be skipped and reported');

    let error: unknown;
    try {
      await startLifecycleModules<void>([{
        id: 'feature.required-missing',
        dependencies: ['feature.not-registered'],
        start() { throw new Error('must not start'); },
      }], undefined);
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof RequiredExtensionStartError && error.extensionId === 'feature.required-missing', 'a required feature with a missing dependency must fail startup explicitly');
  }

  // Observer failures, including promise rejections, cannot stop later observers.
  {
    type Event = { readonly type: 'changed'; readonly value: number };
    const failures: ObserverFailure<Event>[] = [];
    const calls: string[] = [];
    const dispatcher = new EventDispatcher<Event>({
      onObserverFailure(failure) { failures.push(failure); },
    });
    dispatcher.observe('observer.first', event => { calls.push(`first:${event.value}`); });
    dispatcher.observe('observer.sync-failure', () => { throw new Error('sync observer failed'); });
    dispatcher.observe('observer.async-failure', async () => { throw new Error('async observer failed'); });
    const removeLast = dispatcher.observe('observer.last', event => { calls.push(`last:${event.value}`); });
    assertThrows(() => dispatcher.observe('observer.last', () => {}), DuplicateObserverIdError, 'observer ids must be unique');
    dispatcher.dispatch({ type: 'changed', value: 7 });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert(calls.join(',') === 'first:7,last:7', 'observer invocation must preserve registration order despite failures');
    assert(failures.map(failure => failure.observerId).join(',') === 'observer.sync-failure,observer.async-failure', 'sync and async observer failures must both be isolated and reported');
    removeLast();
    dispatcher.dispose();
    dispatcher.dispatch({ type: 'changed', value: 8 });
    assert(dispatcher.size === 0 && calls.join(',') === 'first:7,last:7', 'disposed dispatchers must release and stop all observers');
  }

  console.log('Extension mechanisms unit test: PASS');
}

function feature(id: string, dependencies: readonly string[], log: string[]): LifecycleModule<string[]> {
  return {
    id,
    dependencies,
    start() {
      log.push(`start:${id}`);
      return () => log.push(`stop:${id}`);
    },
  };
}

function assertThrows<TError extends Error>(
  operation: () => unknown,
  errorType: new (...args: never[]) => TError,
  message: string,
): void {
  let error: unknown;
  try { operation(); } catch (caught) { error = caught; }
  assert(error instanceof errorType, message);
}

async function assertRejects<TError extends Error>(
  operation: () => Promise<unknown>,
  errorType: new (...args: never[]) => TError,
  message: string,
): Promise<void> {
  let error: unknown;
  try { await operation(); } catch (caught) { error = caught; }
  assert(error instanceof errorType, message);
}

void main().catch(error => {
  console.error(error);
  throw error;
});
