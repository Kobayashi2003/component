/**
 * Clone and freeze arrays and plain data objects without touching opaque host
 * values such as DOM nodes, Errors, Dates, Maps, or class instances.
 *
 * Reader snapshots are public runtime values, so TypeScript `readonly` alone is
 * not enough: consumers must not receive references that can mutate live Core
 * state behind the reader's transaction boundary.
 */
export function cloneAndFreezePlainData<T>(value: T): T {
  return clone(value, new WeakMap<object, unknown>());
}

function clone<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (!value || typeof value !== 'object') return value;
  if (!Array.isArray(value) && !isPlainObject(value)) return value;

  const known = seen.get(value);
  if (known) return known as T;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const child of value) out.push(clone(child, seen));
    return Object.freeze(out) as T;
  }

  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [key, child] of Object.entries(value)) out[key] = clone(child, seen);
  return Object.freeze(out) as T;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
