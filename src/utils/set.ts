/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { batch } from "solid-js";
import { Store, unwrap} from "solid-js/store"
import { deepEqual, setInArray, setInObject } from "./utils";
import {
  Accessor,
  AccessorFunction,
  AccessorTargetType,
  AccessPath,
  getAccessorPath,
  getFromAccessorChain,
  isAccessFunc,
  getAccessFuncPath,
  isAccessPredicate,
  isAccessSelector,
  UnitAccessor,
} from "./access";

export type MutatorFunc<T> = ( value: T) => T | Partial<T>;
export type Value<T> = Partial<T> | T | MutatorFunc<T>;
export type ValueTransformer<A extends Accessor> = Value<AccessorTargetType<A>>;

export type Mutation = [AccessPath, ValueTransformer<any>];
export type Mutations = Mutation[];
export type CommitMutations<R> = (root: R, m: Mutations) => R;
export function isTransformFunc<A extends Accessor>(
  transformer: ValueTransformer<A>
): transformer is MutatorFunc<AccessorTargetType<A>> {
  return typeof transformer === "function";
}

export function setFromAccessorChain<R, A extends AccessPath, V extends ValueTransformer<A>>(
  root: R,
  accessorChain: A,
  value: V
): R {
  const applyValue = (r: any) => (typeof value === "function" ? value(r) : value) as R;
  if (accessorChain.length === 0) {
    // root is the target
    const newNode = applyValue(root);

    // Return root if structural equality
    return deepEqual(root, newNode) ? root : newNode;
  } else {
    // root is a parent of the target
    const [part, ...nextAccessors]: AccessPath = accessorChain;
    const r = root;
    if (isAccessSelector(part)) {
      if (!Array.isArray(r)) {
        throw new Error("Unexpected selector in path, value is not array");
      }

      const changed: any[] = [];
      r.forEach((t) => {
        changed.push(setFromAccessorChain(t, nextAccessors, value));
      });
      return changed as unknown as R;
    }
    if (isAccessPredicate(part)) {
      if (!Array.isArray(r)) {
        throw new Error("Unexpected predicate in path, value is not array");
      }
      const [nestedPath, value] = part;
      const changed = r.map((t) => {
        const nestedValue: any = getFromAccessorChain(t, nestedPath);
        if (!deepEqual(nestedValue, value)) {
          return t;
        }
        return setFromAccessorChain(t, nextAccessors, value);
      });
      return changed as unknown as R;
    }

    const key = part as keyof R;
    const nested = root[key];
    const newValue = setFromAccessorChain(nested, nextAccessors, value);

    // Return root if identity equality
    return nested === newValue
      ? root
      : ((Array.isArray(root)
          ? setInArray(root, part as number, newValue)
          : setInObject(root, key, newValue)) as R);
  }
}

export const commitPersistent = <R = any>(root: R, mutations: Mutations): R => {
  return mutations.reduce((r, [chain, value]) => setFromAccessorChain(r, chain, value), root);
};

/**
 * A fluent setter that provides a Proxy-based object tree navigation DSL.
 * It can be used to efficiently mutate and record fine-grained changes.
 * 
 * It supports 3 paradigms for applying changes:
 *  
 *  1. In-place mutation: Primitives and nested values are mutated in-place. 
 *     The mutated value is returned as-is.
 *  
 *  2. Immutable persistent mutation: A new value is created by replacing containers 
 *     on the path from the root to the mutation location. The updated top-level 
 *     container structurally shares references with unchanged parts of the previous value.
 *
 *  3. Record mutations without changing the object tree until explicitly requested.
 *     Changes are recorded in a fine-grained summary with paths and values.
 *     The calling code can access the changes before applying them.
 *
*/

export class Mutagen<R> {
  private lastRoot?: R;
  constructor(
    private value: () => R,
    private baseChain: AccessPath,
    private mutations: Mutations = [],
    private commit: CommitMutations<R> = commitPersistent
  ) {}

  /**
   * Set subproperty value using accessor function
   */
  set<T>(accessor: AccessorFunction<R, T>, value: Value<T>): this;

  /**
   * Set subproperty value using accessor chain
   */
  set<T, A extends AccessPath>(accessor: A, value: Value<unknown>): this;

  /**
   * Set subproperty value
   */
  set<A extends Accessor>(accessor: A, value: ValueTransformer<A>): this {
    this.mutations.push([getAccessorPath(accessor), value]);
    return this;
  }

  self(value: Value<R>): this {
    this.mutations.push([[], value]);
    return this;
  }

  selfNow(value: Value<R>): this {
    this.self(value).engage();
    return this;
  }

  setNow<T>(accessor: AccessorFunction<R, T>, value: Value<T>): this;
  setNow<T, A extends AccessPath>(accessor: A, value: Value<unknown>): this;
  setNow<T, A extends Accessor>(accessor: A, value: ValueTransformer<A>): this {
    this.set(getAccessorPath(accessor), value).engage();
    return this;
  }

  mut<T, A extends AccessorFunction<R, T>>(accessor: A): Mutagen<T> {
    const accessorChain = getAccessFuncPath(this.value, accessor);
    const nestedGetter = () => getFromAccessorChain(this.value(), accessorChain);
    const nestedBaseChain: AccessPath = this.baseChain.concat(accessorChain);
    return new Mutagen<T>(nestedGetter, nestedBaseChain, [], (root, m) => {
      const pathPrependMutations = m.map(
        ([chain, value]) => [nestedBaseChain.concat(chain), value] as Mutation
      );

      this.commit(this.value(), this.mutations.concat(pathPrependMutations));
      this.mutations = [];
      return nestedGetter();
    });
  }

  lazyValue() {
    return () => {
      this.processMutations();
      return this.value();
    };
  }

  /**
   * return a reference to current value under mutation
   */
  ref(f: (ref: () => R) => void) {
    f(this.value);
    return this;
  }

  /**
   * Commit the set of mutations and return void
   */
  engage() {
    this.processMutations();
    this.value();
  }

  private processMutations() {
    const mut = this.mutations;
    const val = this.value;
    this.mutations = [];
    this.value = () => {
      let r = this.lastRoot;
      this.value = () => r!;
      r = this.commit(val(), mut);
      this.lastRoot = r;
      return r;
    };
  }

  /**
   * Commit the set of mutations and return new value on the current leaf
   */
  makeItSo() {
    this.engage();
    return this.value();
  }
}

/**
 * Fluently mutate solid reactive tree
 */
export function setStateMutator<R>([state, setState]: [Store<R>, any]): Mutagen<R> {
  return new Mutagen(
    () => state,
    [],
    [],
    (root, m) => {
      const map = m.map(([chain, value]) => {
        if (chain.length === 0) {
          return [value];
        }
        return [
          ...chain.map((part) => {
            if (isAccessSelector(part)) {
              return () => true;
            }
            if (isAccessPredicate(part)) {
              const [path, value] = part;
              return (item: any) => deepEqual(value, getFromAccessorChain(item, path));
            }
            return part;
          }),
          value,
        ];
      });
      batch(() => {
        map.forEach((i) => setState(...i));
      });
      return state;
    }
  );
}

/**
 * Update immutable tree
 */
export function set<R, T, A extends Accessor>(
  root: R,
  accessor: A,
  value?: ValueTransformer<A>
): R {
  const access = accessor;
  return setFromAccessorChain(
    root,
    isAccessFunc(access) ? getAccessFuncPath(() => root, access) : (accessor as AccessPath),
    value
  );
}
