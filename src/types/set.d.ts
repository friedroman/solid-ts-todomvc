declare module "solid-js" {
  const SNODE: unique symbol, SPROXY: unique symbol;
  type StateNode = {
    [SNODE]?: any;
    [SPROXY]?: any;
    [k: string]: any;
    [k: number]: any;
  };
  type AddSymbolToPrimitive<T> = T extends {
    [Symbol.toPrimitive]: infer V;
  }
    ? { [Symbol.toPrimitive]: V }
    : {};
  type AddCallable<T> = T extends {
    (...x: any[]): infer V;
  }
    ? { (...x: Parameters<T>): V }
    : {};
  export type Wrapped<T> = {
    [P in keyof T]: T[P] extends object ? Wrapped<T[P]> : T[P];
  } & {
    _state: T;
  } & AddSymbolToPrimitive<T> &
    AddCallable<T>;
  type StateAtom = string | number | boolean | symbol | null | undefined | any[];
  type StateSetter<T> =
    | Partial<T>
    | ((prevState: Wrapped<T>, traversed?: (string | number)[]) => Partial<T>);
  type NestedStateSetter<T> =
    | StateSetter<T>
    | StateAtom
    | ((prevState: StateAtom, traversed?: (string | number)[]) => StateAtom);
  export type StatePathRange = {
    from?: number;
    to?: number;
    by?: number;
  };
  export type StatePathPart =
    | string
    | number
    | (string | number)[]
    | StatePathRange
    | ((item: any, index: number) => boolean);

  export type StatePath =
    | [string, NestedStateSetter<unknown>]
    | [string, StatePathPart, NestedStateSetter<unknown>]
    | [string, StatePathPart, StatePathPart, NestedStateSetter<unknown>]
    | [string, StatePathPart, StatePathPart, StatePathPart, NestedStateSetter<unknown>]
    | [string, StatePathPart, StatePathPart, StatePathPart, StatePathPart, NestedStateSetter<unknown>]
    | [string, StatePathPart, StatePathPart, StatePathPart, StatePathPart, StatePathPart, NestedStateSetter<unknown>]
    | [string, StatePathPart, StatePathPart, StatePathPart, StatePathPart, StatePathPart, StatePathPart, NestedStateSetter<unknown>];
  export interface SetStateFunction<T> {
    (update: StateSetter<T>): void;
    (...path: StatePath): void;
    (paths: StatePath[]): void;
    (reconcile: (s: Wrapped<T>) => void): void;
  }
  export function createState<T extends StateNode>(
    state: T | Wrapped<T>
  ): [Wrapped<T>, SetStateFunction<T>];
  export function isWrappable(obj: any): boolean;
  export function unwrap<T extends StateNode>(item: any): T;
  export function setProperty(
    state: StateNode,
    property: string | number,
    value: any,
    force?: boolean
  ): void;
  export function force<T>(update: StateSetter<T>): (state: Wrapped<T>) => void;
  export function force<T>(...path: StatePath): (state: Wrapped<T>) => void;
  export function force<T>(paths: StatePath[]): (state: Wrapped<T>) => void;
  export function force<T>(reconcile: (s: Wrapped<T>) => void): (state: Wrapped<T>) => void;
  export function createSignal<T>(
    value?: T,
    comparator?: (v?: T, p?: T) => boolean
  ): [() => T, (v: T) => void];
  export function createEffect<T>(fn: (v?: T) => T, value?: T): void;
  export function createDependentEffect<T>(
    fn: (v?: T) => T,
    deps: () => any | (() => any)[],
    defer?: boolean
  ): void;
  export function createMemo<T>(
    fn: (v: T | undefined) => T,
    value?: T,
    comparator?: (a: T, b: T) => boolean
  ): () => T;
  export function createRoot<T>(fn: (dispose: () => void) => T, detachedOwner?: ComputationNode): T;
  export function freeze<T>(fn: () => T): T;
  export function sample<T>(fn: () => T): T;
  export function onCleanup(fn: (final: boolean) => void): void;
  export function afterEffects(fn: () => void): void;
  export function isListening(): boolean;
  export interface Context {
    id: symbol;
    Provider: (props: any) => any;
    defaultValue: unknown;
  }
  export function createContext(defaultValue?: unknown): Context;
  export function useContext(context: Context): any;
  export function getContextOwner(): ComputationNode | null;
  export class DataNode {
    value?: any;
    pending: any;
    log: Log | null;
    constructor(value?: any);
    current(): any;
    next(value: any): any;
  }
  export type ComputationNode = {
    fn: ((v: any) => any) | null;
    value: any;
    comparator?: (a: any, b: any) => boolean;
    age: number;
    state: number;
    source1: null | Log;
    source1slot: number;
    sources: null | Log[];
    sourceslots: null | number[];
    dependents: null | (ComputationNode | null)[];
    dependentslot: number;
    dependentcount: number;
    owner: ComputationNode | null;
    log: Log | null;
    context: any;
    noRecycle?: boolean;
    owned: ComputationNode[] | null;
    cleanups: (((final: boolean) => void)[]) | null;
  };
  export type Log = {
    node1: null | ComputationNode;
    node1slot: number;
    nodes: null | ComputationNode[];
    nodeslots: null | number[];
  };
}
