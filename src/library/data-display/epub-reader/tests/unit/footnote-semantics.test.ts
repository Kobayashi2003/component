import { isFootnoteReference } from '../../core/interaction/navigation/footnote';

function equal(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
}

function semanticAnchor(attributes: Readonly<Record<string, string>>): Element {
  return {
    getAttribute(name: string) { return attributes[name] ?? null; },
  } as unknown as Element;
}

equal(isFootnoteReference(semanticAnchor({ 'epub:type': 'noteref' })), true);
equal(isFootnoteReference(semanticAnchor({ 'epub:type': 'pagebreak noteref' })), true);
equal(isFootnoteReference(semanticAnchor({ role: 'doc-noteref' })), true);
equal(isFootnoteReference(semanticAnchor({ type: 'NOTEREF' })), true);
equal(isFootnoteReference(semanticAnchor({ 'epub:type': 'backlink' })), false);
equal(isFootnoteReference(semanticAnchor({})), false);

console.log('Footnote semantics unit test: PASS');
