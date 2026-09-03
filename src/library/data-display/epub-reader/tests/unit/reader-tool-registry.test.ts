import { createReaderToolRegistry } from '../../react/tools/reader-tool-registry';
import type { ReaderToolModule } from '../../react/tools/model';
import type { EpubReaderHandle } from '../../react/state/model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader tool registry unit test failed: ${message}`);
}

function assertThrows(run: () => void, message: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

const tool = (id: string, overrides: Partial<ReaderToolModule> = {}): ReaderToolModule => ({
  id,
  label: id,
  shortLabel: id,
  description: `${id} description`,
  placement: 'secondary',
  renderIcon: () => null,
  render: () => null,
  ...overrides,
});

const registry = createReaderToolRegistry([
  tool('product.first'),
  tool('product.hidden', { isAvailable: () => false }),
  tool('product.faulty', { isAvailable: () => { throw new Error('fault'); } }),
]);
const reader = {} as EpubReaderHandle;
assert(Object.isFrozen(registry) && Object.isFrozen(registry.modules), 'the registry and ordered module list must be immutable');
assert(registry.resolve('product.first')?.label === 'product.first', 'modules must resolve by stable id');
assert(registry.available({ reader }).map(tool => tool.id).join(',') === 'product.first', 'unavailable and faulty optional tools must be isolated');

assertThrows(
  () => createReaderToolRegistry([tool('product.same'), tool('product.same')]),
  'duplicate ids must be rejected',
);
assertThrows(
  () => createReaderToolRegistry([tool('product.bad', { placement: 'floating' as 'secondary' })]),
  'arbitrary Shell placements must be rejected',
);
assertThrows(
  () => createReaderToolRegistry([
    tool('product.search-one', { command: 'open-search' }),
    tool('product.search-two', { command: 'open-search' }),
  ]),
  'a Core host command must have only one tool owner',
);

console.log('Reader tool registry unit test: PASS');
