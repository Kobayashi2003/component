import {
  PublicationContentDocumentCache,
  type MaterializedContentDocument,
  type PublicationContentDocumentMaterializer,
  type PublicationContentDocumentPipeline,
} from '../../core/epub/content';
import type { SpineItem } from '../../core/epub/publication';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const items: readonly SpineItem[] = [0, 1, 2].map(index => ({
  index,
  idref: `chapter-${index}`,
  href: `EPUB/chapter-${index}.xhtml`,
  path: `EPUB/chapter-${index}.xhtml`,
  remote: false,
  mediaType: 'application/xhtml+xml',
  linear: true,
  properties: [],
  rendition: {},
}));

function result(item: SpineItem, markup = `<p>${item.index}</p>`): MaterializedContentDocument {
  return {
    sourcePath: item.path!,
    markup,
    url: `blob:${item.index}`,
    mediaType: 'application/xhtml+xml',
    hints: {},
    diagnostics: [],
  };
}

function fakePipeline(signature = 'epub-compat/v1;content:test'): PublicationContentDocumentPipeline {
  return { renderSignature: signature } as unknown as PublicationContentDocumentPipeline;
}

async function main() {
  let releasePending!: (document: MaterializedContentDocument) => void;
  let pendingLoads = 0;
  const pendingMaterializer: PublicationContentDocumentMaterializer = () => {
    pendingLoads += 1;
    return new Promise(resolve => { releasePending = resolve; });
  };
  const pendingCache = new PublicationContentDocumentCache(fakePipeline(), {}, pendingMaterializer);
  const first = pendingCache.materialize(items[0]!);
  const duplicate = pendingCache.materialize(items[0]!);
  assert(pendingLoads === 1 && pendingCache.snapshot.pendingDocuments === 1, 'concurrent mounts must share one materialization');
  releasePending(result(items[0]!));
  const [firstDocument, duplicateDocument] = await Promise.all([first, duplicate]);
  assert(firstDocument === duplicateDocument, 'deduplicated callers must receive the same immutable result');
  assert(Object.isFrozen(firstDocument) && Object.isFrozen(firstDocument.hints) && Object.isFrozen(firstDocument.diagnostics), 'cached content metadata must be immutable');
  await pendingCache.materialize(items[0]!);
  assert(pendingLoads === 1 && pendingCache.snapshot.readyDocuments === 1, 'revisiting a ready chapter must avoid a second materialization');

  const variantLoads: string[] = [];
  const variantMaterializer: PublicationContentDocumentMaterializer = async item => {
    variantLoads.push(`${item.index}`);
    return result(item);
  };
  const variantCache = new PublicationContentDocumentCache(
    fakePipeline('epub-compat/v1;content-document:content-document.processing:test:2'),
    {},
    variantMaterializer,
  );
  await variantCache.materialize(items[0]!);
  await variantCache.materialize(items[0]!);
  assert(variantLoads.join(',') === '0', 'one immutable compatibility profile must share a materialized document');
  assert(variantCache.snapshot.keys[0]?.includes('test:2'), 'content cache keys must include the immutable profile signature');

  const boundedLoads = [0, 0, 0];
  const boundedMaterializer: PublicationContentDocumentMaterializer = async item => {
    boundedLoads[item.index] = (boundedLoads[item.index] ?? 0) + 1;
    return result(item);
  };
  const boundedCache = new PublicationContentDocumentCache(fakePipeline(), {
    policy: { maxDocuments: 2, maxBytes: 1024 },
    preferredSpineIndex: () => 0,
  }, boundedMaterializer);
  await boundedCache.materialize(items[0]!);
  await boundedCache.materialize(items[1]!);
  await boundedCache.materialize(items[2]!);
  assert(boundedCache.snapshot.keys.every(key => key.startsWith('0:') || key.startsWith('1:')), 'capacity pressure must preserve the active and adjacent chapters before a distant one');
  await boundedCache.materialize(items[2]!);
  assert(boundedLoads.join(',') === '1,1,2', 'an evicted distant chapter must reload without disturbing preferred chapters');

  const oversizedCache = new PublicationContentDocumentCache(fakePipeline(), {
    policy: { maxDocuments: 2, maxBytes: 4 },
  }, async item => result(item, 'oversized markup'));
  const oversized = await oversizedCache.materialize(items[0]!);
  assert(oversized.markup === 'oversized markup' && oversizedCache.snapshot.readyDocuments === 0, 'an oversized document must serve its caller without remaining resident');

  let releaseAfterClear!: (document: MaterializedContentDocument) => void;
  const clearingCache = new PublicationContentDocumentCache(fakePipeline(), {}, () => (
    new Promise(resolve => { releaseAfterClear = resolve; })
  ));
  const clearing = clearingCache.materialize(items[1]!);
  clearingCache.clear();
  releaseAfterClear(result(items[1]!));
  await clearing;
  assert(clearingCache.snapshot.pendingDocuments === 0 && clearingCache.snapshot.readyDocuments === 0, 'cleared in-flight work must not repopulate the cache after it resolves');
  clearingCache.dispose();
  const disposedError = await clearingCache.materialize(items[0]!).then(() => null, error => error);
  assert(disposedError instanceof Error && disposedError.message.includes('disposed'), 'a disposed publication cache must reject new work');

  console.log('Content document cache unit test: PASS');
}

void main();
