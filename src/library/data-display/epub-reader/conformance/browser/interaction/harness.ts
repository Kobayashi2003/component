export interface PagePosition {
  readonly current: number;
  readonly total: number;
}
export async function chooseFile(file: File): Promise<void> {
  const input = await waitFor(
    () => document.querySelector<HTMLInputElement>(".epub-file-picker__input"),
    "EPUB file input",
  );
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(
    () => document.querySelector(".epub-reader-shell"),
    "reader shell after choosing a file",
  );
}

export async function waitForPage(
  predicate: (position: PagePosition) => boolean,
  description: string,
): Promise<PagePosition> {
  return waitFor(
    () => {
      const text =
        document
          .querySelector(".epub-reader-controls__status strong")
          ?.textContent?.trim() ?? "";
      const match = /^(\d+)\s*\/\s*(\d+)$/u.exec(text);
      if (!match) return null;
      const position = { current: Number(match[1]), total: Number(match[2]) };
      return predicate(position) ? position : null;
    },
    description,
    15000,
  );
}

export async function waitForPanel(title: string): Promise<HTMLElement> {
  return waitFor(() => {
    const panel = document.querySelector<HTMLElement>(
      ".epub-reader-shell__panel",
    );
    const heading = panel
      ?.querySelector(".epub-reader-shell__panel-context strong")
      ?.textContent?.trim();
    return panel && heading === title ? panel : null;
  }, `${title} panel`);
}

export async function waitFor<T>(
  probe: () => T | null | undefined | false,
  description: string,
  timeoutMs = 8000,
): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const value = probe();
    if (value) return value;
    await delay(50);
  }
  const active = document.activeElement;
  const focusDescription =
    active instanceof HTMLElement
      ? `${active.tagName.toLowerCase()}${active.getAttribute("aria-label") ? `[aria-label="${active.getAttribute("aria-label")}"]` : ""}.${active.className || "<no-class>"}`
      : "<none>";
  throw new Error(
    `Timed out waiting for ${description}. Active element: ${focusDescription}.`,
  );
}

export function required<T extends Element = Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required element was not found: ${selector}`);
  return element;
}

export function buttonWithLabel(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`Button was not found: ${label}`);
  return button;
}

export function buttonWithText(
  root: ParentNode,
  text: string,
): HTMLButtonElement {
  const button = Array.from(
    root.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`Button was not found by text: ${text}`);
  return button;
}

export function fixedSpreadFacingGap(root: HTMLElement): number {
  const left = root
    .querySelector<HTMLElement>('[data-epub-spread-slot="left"] iframe')
    ?.getBoundingClientRect();
  const right = root
    .querySelector<HTMLElement>('[data-epub-spread-slot="right"] iframe')
    ?.getBoundingClientRect();
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(right.left - left.right);
}

export function click(button: HTMLButtonElement): void {
  if (button.disabled)
    throw new Error(
      `Button is disabled: ${button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "<unknown>"}`,
    );
  button.click();
}

export function dispatchKey(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

export function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) throw new Error("HTML input value setter is unavailable.");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
