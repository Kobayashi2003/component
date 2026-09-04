declare module "react" {
  export type ReactNode = unknown;
  export class Component<P = {}, S = {}> {
    constructor(props: P);
    readonly props: Readonly<P>;
    state: Readonly<S>;
    setState(
      state: S | ((previous: Readonly<S>, props: Readonly<P>) => S),
    ): void;
    componentDidUpdate?(
      previousProps: Readonly<P>,
      previousState: Readonly<S>,
    ): void;
    render(): ReactNode;
  }
  export type RefCallback<T> = (instance: T | null) => void;
  export interface RefObject<T> {
    current: T;
  }
  export interface CSSProperties {
    [key: string]: string | number | undefined;
  }
  export interface FormEvent<T = Element> extends Event {
    readonly currentTarget: T;
  }
  export interface ChangeEvent<T = Element> extends Event {
    readonly currentTarget: T;
  }
  export interface KeyboardEvent<T = Element> extends Event {
    readonly currentTarget: T;
    readonly target: EventTarget;
    readonly key: string;
    readonly altKey: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    preventDefault(): void;
    stopPropagation(): void;
  }
  export interface FocusEvent<T = Element> extends Event {
    readonly currentTarget: T;
    readonly relatedTarget: EventTarget | null;
  }
  export interface MouseEvent<T = Element> extends Event {
    readonly currentTarget: T;
  }
  export interface DragEvent<T = Element> extends Event {
    readonly currentTarget: T;
    readonly relatedTarget: EventTarget | null;
    readonly dataTransfer: DataTransfer;
    preventDefault(): void;
  }
  export interface Context<T> {
    Provider: (props: { value: T; children?: ReactNode }) => unknown;
  }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useState<T>(
    initial: T | (() => T),
  ): [T, (value: T | ((previous: T) => T)) => void];
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ): void;
  export function useLayoutEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export interface MutableRefObject<T> {
    current: T;
  }
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useCallback<T extends (...args: any[]) => any>(
    callback: T,
    deps: readonly unknown[],
  ): T;
  export function useId(): string;
  export function useSyncExternalStore<T>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T;
}

declare module "react/jsx-runtime" {
  export const Fragment: unknown;
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
}

declare namespace JSX {
  interface IntrinsicAttributes {
    key?: string | number;
  }
  interface IntrinsicElements {
    [elementName: string]: any;
  }
}
