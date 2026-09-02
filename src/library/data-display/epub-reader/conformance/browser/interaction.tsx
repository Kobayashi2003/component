import { createRoot } from 'react-dom/client';
import verticalFixtureUrl from '../../fixtures/corpus/vertical-ruby.epub?url';
import { EpubReaderShowcase } from '../../showcase/EpubReaderShowcase';
import '../../styles.css';

interface PagePosition {
  readonly current: number;
  readonly total: number;
}

const resultElement = document.getElementById('result');
const rootElement = document.getElementById('root');
if (!resultElement || !rootElement) throw new Error('Browser interaction harness is incomplete.');
const resultNode = resultElement;

createRoot(rootElement).render(<EpubReaderShowcase />);

void run().then(
  steps => finish({ status: 'pass', steps }),
  error => finish({
    status: 'fail',
    reason: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }),
);

async function run(): Promise<readonly string[]> {
  const steps: string[] = [];
  const fixtureResponse = await fetch(verticalFixtureUrl);
  assert(fixtureResponse.ok, `fixture request failed with ${fixtureResponse.status}`);
  const fixture = new File([await fixtureResponse.arrayBuffer()], 'vertical-ruby.epub', { type: 'application/epub+zip' });

  await chooseFile(fixture);
  const initial = await waitForPage(position => position.total > 1 && position.current > 0, 'multi-page publication to become ready');
  steps.push(`opened vertical EPUB at ${initial.current}/${initial.total}`);

  click(required<HTMLButtonElement>('.epub-reader-controls__nav--next'));
  const advanced = await waitForPage(position => position.current !== initial.current, 'next-page click to update position');
  steps.push(`next-page click moved to ${advanced.current}/${advanced.total}`);

  await delay(500);
  click(buttonWithLabel('Close book'));
  await waitFor(() => document.querySelector<HTMLInputElement>('.epub-file-picker__input'), 'empty file picker after closing');
  await chooseFile(fixture);
  const restored = await waitForPage(position => position.current === advanced.current, 'saved reading position to restore');
  steps.push(`reading session restored ${restored.current}/${restored.total}`);

  const contentFrame = await waitFor(
    () => document.querySelector<HTMLIFrameElement>('iframe[data-epub-surface-id]'),
    'EPUB content frame',
  );
  const contentDocument = contentFrame.contentDocument;
  assert(contentDocument?.body, 'EPUB content document must remain same-origin');
  const externalTrigger = contentDocument.createElement('a');
  externalTrigger.href = '#external-fixture';
  externalTrigger.dataset.epubHref = 'https://example.com/reader?from=epub#fixture';
  externalTrigger.textContent = 'External fixture';
  contentDocument.body.appendChild(externalTrigger);
  externalTrigger.focus();
  externalTrigger.click();
  const externalDialog = await waitFor(
    () => document.querySelector<HTMLElement>('.epub-reader-external-link'),
    'external-link confirmation dialog',
  );
  const externalAction = externalDialog.querySelector<HTMLAnchorElement>('a[href]');
  assert(externalAction?.getAttribute('href') === 'https://example.com/reader?from=epub#fixture', 'external action should retain the routed URL');
  assert(externalAction.target === '_blank', 'website action should open a new tab');
  assert(externalAction.relList.contains('noopener') && externalAction.relList.contains('noreferrer'), 'website action should isolate the new tab');
  assert(document.activeElement === externalDialog.querySelector('footer button'), 'external dialog should initially focus the safe Cancel action');
  assert(required<HTMLElement>('.epub-reader-shell__body').inert, 'external dialog should isolate reader content');
  click(required<HTMLButtonElement>('.epub-reader-external-link footer button'));
  await waitFor(() => !document.querySelector('.epub-reader-external-link'), 'external-link dialog to close');
  await waitFor(() => document.activeElement === contentFrame, 'external-link cancellation to restore content-frame focus');
  assert(!required<HTMLElement>('.epub-reader-shell__body').inert, 'reader content should be interactive after cancellation');
  steps.push('external website required confirmation and restored reading focus');

  const contentsButton = buttonWithLabel('Contents');
  click(contentsButton);
  await waitForPanel('Contents');
  dispatchKey(document.activeElement ?? required('.epub-reader-shell'), { key: 'Escape', code: 'Escape' });
  await waitFor(() => !document.querySelector('.epub-reader-shell__panel'), 'contents panel to close with Escape');
  await waitFor(() => document.activeElement === contentsButton, 'closing Contents with Escape to restore trigger focus');
  steps.push('panel Escape handling restored trigger focus');

  const viewport = required<HTMLElement>('.epub-reader-shell__viewport');
  viewport.focus();
  dispatchKey(viewport, { key: '?', code: 'Slash', shiftKey: true });
  await waitForPanel('Keyboard shortcuts');
  dispatchKey(document.activeElement ?? viewport, { key: 'Escape', code: 'Escape' });
  await waitFor(() => !document.querySelector('.epub-reader-shell__panel'), 'keyboard-help panel to close');
  steps.push('keyboard shortcut opened and closed Help');

  click(buttonWithLabel('Search'));
  await waitForPanel('Search');
  const searchInput = await waitFor(() => document.querySelector<HTMLInputElement>('input[aria-label="Find in book"]'), 'search input');
  setInputValue(searchInput, '吾輩');
  searchInput.form?.requestSubmit();
  const searchSummary = await waitFor(() => {
    const text = document.querySelector('.epub-search-panel__summary')?.textContent?.trim() ?? '';
    return /result/u.test(text) ? text : null;
  }, 'search results');
  assert(document.querySelector('.epub-search-panel__results mark')?.textContent === '吾輩', 'search result must highlight the query');
  steps.push(`search completed: ${searchSummary}`);
  click(required<HTMLButtonElement>('.epub-search-panel__results li button'));
  const located = await waitForPage(position => position.current === 1, 'search locator to navigate to its first match');
  steps.push(`lightweight search locator navigated to ${located.current}/${located.total}`);
  click(buttonWithLabel('Close Search'));
  await waitFor(() => !document.querySelector('.epub-reader-shell__panel'), 'search panel to close');

  click(buttonWithLabel('Reader settings'));
  await waitForPanel('Reader settings');
  click(required<HTMLButtonElement>('.epub-settings-panel__advanced-entry'));
  await waitFor(() => document.querySelector('.epub-settings-panel--advanced'), 'advanced settings');
  click(required<HTMLButtonElement>('.epub-settings-panel__maintenance-action'));
  click(await waitFor(() => document.querySelector<HTMLButtonElement>('.epub-settings-panel__clear-confirm .is-danger'), 'clear-data confirmation'));
  await waitFor(() => document.querySelector('.epub-settings-panel__maintenance-status'), 'clear-data status');
  click(buttonWithLabel('Close Reader settings'));
  await waitFor(() => !document.querySelector('.epub-reader-shell__panel'), 'settings panel to close');
  click(buttonWithLabel('Close book'));
  await waitFor(() => document.querySelector<HTMLInputElement>('.epub-file-picker__input'), 'file picker after clearing session');
  await chooseFile(fixture);
  const reset = await waitForPage(position => position.current === 1, 'cleared reading session to reopen at page one');
  steps.push(`cleared reading session reopened at ${reset.current}/${reset.total}`);

  return steps;
}

async function chooseFile(file: File): Promise<void> {
  const input = await waitFor(() => document.querySelector<HTMLInputElement>('.epub-file-picker__input'), 'EPUB file input');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => document.querySelector('.epub-reader-shell'), 'reader shell after choosing a file');
}

async function waitForPage(
  predicate: (position: PagePosition) => boolean,
  description: string,
): Promise<PagePosition> {
  return waitFor(() => {
    const text = document.querySelector('.epub-reader-controls__status strong')?.textContent?.trim() ?? '';
    const match = /^(\d+)\s*\/\s*(\d+)$/u.exec(text);
    if (!match) return null;
    const position = { current: Number(match[1]), total: Number(match[2]) };
    return predicate(position) ? position : null;
  }, description, 15000);
}

async function waitForPanel(title: string): Promise<HTMLElement> {
  return waitFor(() => {
    const panel = document.querySelector<HTMLElement>('.epub-reader-shell__panel');
    const heading = panel?.querySelector('.epub-reader-shell__panel-context strong')?.textContent?.trim();
    return panel && heading === title ? panel : null;
  }, `${title} panel`);
}

async function waitFor<T>(probe: () => T | null | undefined | false, description: string, timeoutMs = 8000): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const value = probe();
    if (value) return value;
    await delay(50);
  }
  const active = document.activeElement;
  const focusDescription = active instanceof HTMLElement
    ? `${active.tagName.toLowerCase()}${active.getAttribute('aria-label') ? `[aria-label="${active.getAttribute('aria-label')}"]` : ''}.${active.className || '<no-class>'}`
    : '<none>';
  throw new Error(`Timed out waiting for ${description}. Active element: ${focusDescription}.`);
}

function required<T extends Element = Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required element was not found: ${selector}`);
  return element;
}

function buttonWithLabel(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button was not found: ${label}`);
  return button;
}

function click(button: HTMLButtonElement): void {
  if (button.disabled) throw new Error(`Button is disabled: ${button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '<unknown>'}`);
  button.click();
}

function dispatchKey(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTML input value setter is unavailable.');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function finish(result: Record<string, unknown>): void {
  resultNode.textContent = JSON.stringify(result);
  document.documentElement.dataset.testStatus = String(result.status);
}
