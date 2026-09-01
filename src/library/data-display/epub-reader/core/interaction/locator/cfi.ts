import type { Publication, SpineItem } from '../../epub/publication';
import type { CfiPath, CfiStep, CfiTextAssertion, DomPoint, ParsedEpubCfi } from './model';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const ESCAPED = /[\]^,();]|\[/g;

export function escapeCfiAssertion(value: string): string {
  return value.replace(ESCAPED, character => `^${character}`);
}

export function unescapeCfiAssertion(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '^' && i + 1 < value.length) out += value[++i]!;
    else out += char;
  }
  return out;
}

export function createEpubCfi(
  spineItem: SpineItem,
  document: Document,
  point: DomPoint,
  textAssertion?: CfiTextAssertion,
): string {
  if (!spineItem.cfiBase) throw new Error(`Spine item ${spineItem.index} has no CFI package base.`);
  const path = createContentCfiPath(document, point);
  const withAssertion = textAssertion && path.characterOffset != null ? { ...path, textAssertion } : path;
  return `epubcfi(${spineItem.cfiBase}${serializeCfiPath(withAssertion)})`;
}

export function createContentCfiPath(document: Document, point: DomPoint): CfiPath {
  const root = document.documentElement;
  if (!root) throw new Error('Cannot create a CFI for a document without a root element.');

  let current: Node = point.node;
  const steps: CfiStep[] = [];
  let characterOffset: number | undefined;

  if (isCharacterData(current)) {
    const parent = current.parentNode;
    if (!isElement(parent)) throw new Error('CFI character data must have an element parent.');
    const chunk = characterDataChunk(parent, current);
    steps.unshift({ index: chunk.index });
    characterOffset = clamp(point.offset + chunk.offsetBeforeNode, 0, chunk.length);
    current = parent;
  } else if (!isElement(current)) {
    throw new Error('CFI point must target an element or character-data node.');
  }

  while (current !== root) {
    const parent = current.parentNode;
    if (!isElement(parent) || !isElement(current)) {
      throw new Error('CFI target is not contained by the document element.');
    }
    steps.unshift(elementStep(parent, current));
    current = parent;
  }

  if (steps.length === 0) {
    // The content path is rooted at the referenced XML document element, so a
    // point on the root itself needs a child location. Prefer its first element.
    const first = root.children[0];
    if (first) steps.push(elementStep(root, first));
    else steps.push({ index: 1 });
  }
  return { steps, ...(characterOffset !== undefined ? { characterOffset } : {}) };
}

export function parseEpubCfi(value: string): ParsedEpubCfi {
  const trimmed = value.trim();
  if (!trimmed.startsWith('epubcfi(') || !trimmed.endsWith(')')) {
    throw new SyntaxError('EPUB CFI must use epubcfi(...) syntax.');
  }
  const sourceBody = trimmed.slice(8, -1);
  const rangeParts = splitTopLevel(sourceBody, ',');
  // EPUB CFI requires consumers expecting a point to use the range start.
  const body = rangeParts.length === 3 ? `${rangeParts[0]}${rangeParts[1]}` : sourceBody;
  if (rangeParts.length !== 1 && rangeParts.length !== 3) {
    throw new SyntaxError('Malformed EPUB CFI range.');
  }
  const bang = findUnescaped(body, '!');
  if (bang < 0) throw new SyntaxError('EPUB CFI does not contain package/content indirection (!).');
  return {
    raw: trimmed,
    packagePath: parseCfiPath(body.slice(0, bang)),
    contentPath: parseCfiPath(body.slice(bang + 1)),
  };
}

export function parseCfiPath(value: string): CfiPath {
  const steps: CfiStep[] = [];
  let characterOffset: number | undefined;
  let i = 0;

  while (i < value.length) {
    if (value[i] !== '/') throw new SyntaxError(`Expected '/' at CFI offset ${i}.`);
    i += 1;
    const start = i;
    while (i < value.length && /[0-9]/.test(value[i]!)) i += 1;
    if (i === start) throw new SyntaxError(`Missing CFI step integer at offset ${start}.`);
    const rawNumber = value.slice(start, i);
    if (rawNumber.length > 1 && rawNumber.startsWith('0')) throw new SyntaxError('CFI integers cannot contain leading zeroes.');
    const index = Number(rawNumber);
    if (!Number.isSafeInteger(index) || index < 0) throw new SyntaxError(`Invalid CFI step ${rawNumber}.`);

    let assertion: string | undefined;
    if (value[i] === '[') {
      const parsed = readBracket(value, i);
      assertion = unescapeCfiAssertion(splitAssertionParameters(parsed.content));
      i = parsed.end;
    }
    steps.push({ index, ...(assertion ? { assertion } : {}) });

    if (value[i] === ':') {
      i += 1;
      const offsetStart = i;
      while (i < value.length && /[0-9]/.test(value[i]!)) i += 1;
      if (i === offsetStart) throw new SyntaxError('Missing CFI character offset.');
      const rawOffset = value.slice(offsetStart, i);
      if (rawOffset.length > 1 && rawOffset.startsWith('0')) throw new SyntaxError('CFI offsets cannot contain leading zeroes.');
      characterOffset = Number(rawOffset);
      if (!Number.isSafeInteger(characterOffset) || characterOffset < 0) throw new SyntaxError('Invalid CFI character offset.');
      let textAssertion: CfiTextAssertion | undefined;
      let sideBias: CfiPath['sideBias'];
      if (value[i] === '[') {
        const terminal = readBracket(value, i);
        const parsedTerminal = parseTerminalAssertion(terminal.content);
        textAssertion = parsedTerminal.textAssertion;
        sideBias = parsedTerminal.sideBias;
        i = terminal.end;
      }
      if (i !== value.length) throw new SyntaxError(`Unsupported terminating CFI syntax at offset ${i}.`);
      return { steps, characterOffset, ...(textAssertion ? { textAssertion } : {}), ...(sideBias ? { sideBias } : {}) };
    }
  }

  if (steps.length === 0) throw new SyntaxError('CFI path cannot be empty.');
  return { steps, ...(characterOffset !== undefined ? { characterOffset } : {}) };
}

export function serializeCfiPath(path: CfiPath): string {
  if (path.steps.length === 0) throw new Error('Cannot serialize an empty CFI path.');
  const structural = path.steps.map(step => {
    if (!Number.isSafeInteger(step.index) || step.index < 0) throw new RangeError('CFI step indices must be non-negative safe integers.');
    return `/${step.index}${step.assertion ? `[${escapeCfiAssertion(step.assertion)}]` : ''}`;
  }).join('');
  if (path.characterOffset == null) return structural;
  if (!Number.isSafeInteger(path.characterOffset) || path.characterOffset < 0) throw new RangeError('CFI character offset must be a non-negative safe integer.');
  const terminal = serializeTerminalAssertion(path.textAssertion, path.sideBias);
  return `${structural}:${path.characterOffset}${terminal}`;
}

export function resolveEpubCfi(
  publication: Publication,
  document: Document,
  cfi: string,
): { readonly spineItem: SpineItem; readonly point: DomPoint; readonly correctedCfi?: string } {
  const parsed = parseEpubCfi(cfi);
  const spineItem = resolveCfiSpineItem(publication, parsed.packagePath);
  let point: DomPoint;
  try {
    point = resolveContentCfiPath(document, parsed.contentPath);
  } catch (error) {
    // A structural path can become stale after an edit even when its terminal
    // text assertion is still sufficient to recover the intended position.
    // EPUB CFI explicitly treats assertions as correction information, so do
    // not fail before giving the terminal assertion a chance to recover.
    if (!parsed.contentPath.textAssertion) throw error;
    const correctedPoint = correctPointFromTextAssertion(document, null, parsed.contentPath.textAssertion);
    if (!correctedPoint) throw error;
    point = correctedPoint;
  }
  if (parsed.contentPath.textAssertion && !matchesTextAssertion(document, point, parsed.contentPath.textAssertion)) {
    const correctedPoint = correctPointFromTextAssertion(document, point, parsed.contentPath.textAssertion);
    if (!correctedPoint) throw new RangeError('EPUB CFI text assertion does not match and cannot be corrected.');
    point = correctedPoint;
  }
  const corrected = createEpubCfi(spineItem, document, point, parsed.contentPath.textAssertion);
  return { spineItem, point, ...(corrected !== cfi ? { correctedCfi: corrected } : {}) };
}

export function resolveCfiSpineItem(publication: Publication, packagePath: CfiPath): SpineItem {
  const canonical = serializeCfiPath({ steps: packagePath.steps });
  const exact = publication.spine.find(item => item.cfiBase && stripAssertions(item.cfiBase.slice(0, -1)) === stripAssertions(canonical));
  if (exact) return exact;

  // XML ID assertions are correction hints: package structure may shift while
  // an authored itemref id remains stable.
  const assertedId = packagePath.steps.at(-1)?.assertion;
  if (assertedId) {
    const corrected = publication.spine.find(item => item.itemrefId === assertedId);
    if (corrected) return corrected;
  }
  throw new RangeError('EPUB CFI package path does not resolve to a spine item in this publication.');
}

export function resolveContentCfiPath(document: Document, path: CfiPath): DomPoint {
  const root = document.documentElement;
  if (!root) throw new Error('Cannot resolve a CFI in a document without a root element.');
  let current: Node = root;

  for (let i = 0; i < path.steps.length; i += 1) {
    const step = path.steps[i]!;
    const last = i === path.steps.length - 1;
    if (!isElement(current)) throw new RangeError('CFI attempts to traverse below character data.');

    if (step.index % 2 === 0) {
      const elements = Array.from(current.children);
      if (step.index === 0 || step.index === (elements.length + 1) * 2) {
        if (!last) throw new RangeError('A virtual CFI element can only terminate a point path.');
        return { node: current, offset: step.index === 0 ? 0 : current.childNodes.length };
      }
      const index = step.index / 2 - 1;
      let next = index >= 0 ? elements[index] : undefined;
      if (step.assertion && next?.id !== step.assertion) {
        // Intended-target correction: an XML id can survive structural edits
        // that move the asserted element to a different parent/index.
        next = document.getElementById(step.assertion) ?? undefined;
      }
      if (!next) throw new RangeError(`CFI element step /${step.index} cannot be resolved.`);
      if (last) return { node: next, offset: 0 };
      current = next;
      continue;
    }

    if (!last) throw new RangeError('A character-data CFI step must terminate the content path.');
    return resolveCharacterChunkPoint(current, step.index, path.characterOffset ?? 0);
  }

  return { node: current, offset: 0 };
}

function elementStep(parent: Element, child: Element): CfiStep {
  const elements = Array.from(parent.children);
  const index = elements.indexOf(child);
  if (index < 0) throw new Error('Element is not a child of its expected parent.');
  return { index: (index + 1) * 2, ...(child.id ? { assertion: child.id } : {}) };
}

function characterDataChunk(parent: Element, node: Node): { index: number; offsetBeforeNode: number; length: number } {
  let elementsBefore = 0;
  let found = false;
  let offsetBeforeNode = 0;
  let length = 0;

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) {
      if (found) break;
      elementsBefore += 1;
      offsetBeforeNode = 0;
      continue;
    }
    if (!isCharacterData(child)) continue;
    if (child === node) found = true;
    if (found) length += child.nodeValue?.length ?? 0;
    else offsetBeforeNode += child.nodeValue?.length ?? 0;
  }
  if (!found) throw new Error('Character-data node does not belong to its parent.');

  // Add text nodes earlier in the same chunk to total length.
  length += offsetBeforeNode;
  return { index: elementsBefore * 2 + 1, offsetBeforeNode, length };
}

function resolveCharacterChunkPoint(parent: Element, oddIndex: number, offset: number): DomPoint {
  if (oddIndex < 1 || oddIndex % 2 === 0) throw new RangeError('CFI character-data step must be a positive odd integer.');
  const targetChunk = (oddIndex - 1) / 2;
  let elementCount = 0;
  const nodes: Node[] = [];
  let length = 0;
  let insertionOffset = parent.childNodes.length;

  for (let childIndex = 0; childIndex < parent.childNodes.length; childIndex += 1) {
    const child = parent.childNodes[childIndex]!;
    if (child.nodeType === ELEMENT_NODE) {
      if (elementCount === targetChunk && nodes.length === 0) insertionOffset = childIndex;
      elementCount += 1;
      continue;
    }
    if (!isCharacterData(child) || elementCount !== targetChunk) continue;
    if (nodes.length === 0) insertionOffset = childIndex;
    nodes.push(child);
    length += child.nodeValue?.length ?? 0;
  }

  if (offset > length) throw new RangeError('CFI character offset exceeds the referenced character-data chunk.');
  if (nodes.length === 0) return { node: parent, offset: insertionOffset };

  let remaining = offset;
  for (const node of nodes) {
    const nodeLength = node.nodeValue?.length ?? 0;
    if (remaining <= nodeLength) return { node, offset: remaining };
    remaining -= nodeLength;
  }
  const last = nodes[nodes.length - 1]!;
  return { node: last, offset: last.nodeValue?.length ?? 0 };
}

function isElement(node: Node | null): node is Element {
  return node?.nodeType === ELEMENT_NODE;
}

function isCharacterData(node: Node): boolean {
  return node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE;
}

function readBracket(value: string, start: number): { content: string; end: number } {
  let out = '';
  for (let i = start + 1; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '^') {
      if (i + 1 >= value.length) throw new SyntaxError('Dangling CFI escape character.');
      out += char + value[++i]!;
      continue;
    }
    if (char === ']') return { content: out, end: i + 1 };
    out += char;
  }
  throw new SyntaxError('Unterminated CFI assertion.');
}

function splitAssertionParameters(value: string): string {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '^') { i += 1; continue; }
    if (value[i] === ';') return value.slice(0, i);
  }
  return value;
}

function findUnescaped(value: string, needle: string): number {
  let bracketDepth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '^') { i += 1; continue; }
    if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === needle && bracketDepth === 0) return i;
  }
  return -1;
}


function parseTerminalAssertion(value: string): {
  textAssertion?: CfiTextAssertion;
  sideBias?: CfiPath['sideBias'];
} {
  const semicolon = findUnescaped(value, ';');
  const textPart = semicolon < 0 ? value : value.slice(0, semicolon);
  const params = semicolon < 0 ? '' : value.slice(semicolon + 1);
  const commaParts = splitTopLevel(textPart, ',');
  if (commaParts.length > 2) throw new SyntaxError('Malformed CFI text location assertion.');
  const beforeRaw = commaParts[0] ?? '';
  const afterRaw = commaParts.length === 2 ? commaParts[1] ?? '' : '';
  const before = beforeRaw ? unescapeCfiAssertion(beforeRaw) : undefined;
  const after = afterRaw ? unescapeCfiAssertion(afterRaw) : undefined;
  let sideBias: CfiPath['sideBias'];
  for (const parameter of params.split(';')) {
    if (parameter === 's=b') sideBias = 'before';
    else if (parameter === 's=a') sideBias = 'after';
  }
  return {
    ...(before || after ? { textAssertion: { ...(before ? { before } : {}), ...(after ? { after } : {}) } } : {}),
    ...(sideBias ? { sideBias } : {}),
  };
}

function serializeTerminalAssertion(
  assertion: CfiTextAssertion | undefined,
  sideBias: CfiPath['sideBias'],
): string {
  if (!assertion && !sideBias) return '';
  let text = '';
  if (assertion) {
    const before = assertion.before ? escapeCfiAssertion(assertion.before) : '';
    const after = assertion.after ? escapeCfiAssertion(assertion.after) : '';
    text = after ? `${before},${after}` : before;
  }
  const side = sideBias ? `;s=${sideBias === 'before' ? 'b' : 'a'}` : '';
  return `[${text}${side}]`;
}

function matchesTextAssertion(document: Document, point: DomPoint, assertion: CfiTextAssertion): boolean {
  const raw = rawTextIndex(document);
  const absolute = rawOffsetForPoint(raw, point);
  if (absolute == null) return false;
  const before = normalizeCfiText(raw.text.slice(0, absolute));
  const after = normalizeCfiText(raw.text.slice(absolute));
  return (!assertion.before || before.endsWith(normalizeCfiText(assertion.before)))
    && (!assertion.after || after.startsWith(normalizeCfiText(assertion.after)));
}

function correctPointFromTextAssertion(
  document: Document,
  original: DomPoint | null,
  assertion: CfiTextAssertion,
): DomPoint | null {
  const stream = normalizedTextStream(document);
  const before = assertion.before ? normalizeCfiText(assertion.before) : '';
  const after = assertion.after ? normalizeCfiText(assertion.after) : '';
  if (!before && !after) return null;
  const raw = rawTextIndex(document);
  const rawOriginal = original ? (rawOffsetForPoint(raw, original) ?? 0) : 0;
  const approximate = normalizeCfiText(raw.text.slice(0, rawOriginal)).length;
  const candidates: number[] = [];
  for (let i = 0; i <= stream.text.length; i += 1) {
    if (before && !stream.text.slice(0, i).endsWith(before)) continue;
    if (after && !stream.text.slice(i).startsWith(after)) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a - approximate) - Math.abs(b - approximate));
  return stream.points[Math.min(candidates[0]!, stream.points.length - 1)] ?? null;
}

function normalizeCfiText(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

interface RawTextEntry { node: Node; start: number; end: number }
function rawTextIndex(document: Document): { text: string; entries: RawTextEntry[] } {
  const root = document.body ?? document.documentElement;
  if (!root) return { text: '', entries: [] };
  const walker = document.createTreeWalker(root, 4);
  const entries: RawTextEntry[] = [];
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = node.nodeValue ?? '';
    const start = text.length;
    text += value;
    entries.push({ node, start, end: text.length });
  }
  return { text, entries };
}

function rawOffsetForPoint(index: { text: string; entries: RawTextEntry[] }, point: DomPoint): number | null {
  if (isCharacterData(point.node)) {
    const entry = index.entries.find(candidate => candidate.node === point.node);
    return entry ? entry.start + clamp(point.offset, 0, entry.end - entry.start) : null;
  }
  if (isElement(point.node)) {
    const element = point.node;
    const child = element.childNodes[Math.min(point.offset, Math.max(0, element.childNodes.length - 1))];
    if (!child) return 0;
    const entry = index.entries.find(candidate => candidate.node === child || (isElement(child) && child.contains(candidate.node)));
    return entry?.start ?? null;
  }
  return null;
}

function normalizedTextStream(document: Document): { text: string; points: DomPoint[] } {
  const raw = rawTextIndex(document);
  let text = '';
  const points: DomPoint[] = [];
  let inWhitespace = false;
  for (const entry of raw.entries) {
    const value = entry.node.nodeValue ?? '';
    for (let offset = 0; offset < value.length; offset += 1) {
      const char = value[offset]!;
      if (/\s/u.test(char)) {
        if (inWhitespace) continue;
        inWhitespace = true;
        points.push({ node: entry.node, offset });
        text += ' ';
      } else {
        inWhitespace = false;
        points.push({ node: entry.node, offset });
        text += char;
      }
    }
  }
  const last = raw.entries.at(-1);
  points.push(last ? { node: last.node, offset: last.end - last.start } : { node: document.documentElement, offset: 0 });
  return { text, points };
}

function splitTopLevel(value: string, delimiter: string): string[] {
  const out: string[] = [];
  let start = 0;
  let bracketDepth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '^') { i += 1; continue; }
    if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === delimiter && bracketDepth === 0) {
      out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  out.push(value.slice(start));
  return out;
}

function stripAssertions(value: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (char === '^' && depth > 0) { i += 1; continue; }
    if (char === '[') { depth += 1; continue; }
    if (char === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out += char;
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
