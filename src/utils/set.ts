import { freeze } from "solid-js";
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
  self,
  UnitAccessor,
} from "./access";

type ValueTransformFunc<A extends Accessor<any>> = (
  value: AccessorTargetType<A>
) => AccessorTargetType<A>;
export type ValueTransformer<A extends Accessor<any>> =
  | Partial<AccessorTargetType<A>>
  | AccessorTargetType<A>
  | ValueTransformFunc<A>;

export type Mutation = [AccessPath, ValueTransformer<any>];
export type Mutations = Mutation[];
export type CommitMutations<R> = (root: R, m: Mutations) => R;
export function isTransformFunc<A extends Accessor<any>>(
  transformer: ValueTransformer<A>
): transformer is ValueTransformFunc<A> {
  return typeof transformer === "function";
}

export function setFromAccessorChain<
  R extends any,
  A extends AccessPath,
  V extends ValueTransformer<A>
>(root: R, accessorChain: A, value: V): R {
  const applyValue = (r: R): R => (isTransformFunc(value) ? value(r) : value) as R;
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
      return r.reduce((l, t) => {
        l.push(setFromAccessorChain(t, nextAccessors, value));
        return l;
      }, []);
    }
    if (isAccessPredicate(part)) {
      if (!Array.isArray(r)) {
        throw new Error("Unexpected predicate in path, value is not array");
      }
      const [nestedPath, value] = part;
      const modified: [number, any][] = r.reduce((l, t, i) => {
        const nestedValue = getFromAccessorChain(t, nestedPath);
        if (!deepEqual(nestedValue, value)) {
          return l;
        }
        l.push([i, setFromAccessorChain(t, nextAccessors, value)]);
        return l;
      }, []);
      return r.map((t, i) => {
        const modification = modified.find(([mi]) => i === mi);
        if (!modification) {
          return t;
        }
        return modification[1];
      }) as any;
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
 * A fluent setter with a Proxy-based object tree navigation DSL
 * Can be used to implement efficient mutation and fine-grained change recording
 *
 * It supports any of the 3 paradigms of applying changes:
 *  * Familiar in-place mutation where we change in-place
 *    primitive value or recursively: nested object and it's values,
 *    array, nested array and it's values. Then it returns mutated value as is.
 *  * Immutable persistent mutation where we create a new value
 *    out of the current value by replacing every container on the
 *    path from original root container to the location of an intended mutation in the object tree.
 *    Finally returning updated top-level container that structurally
 *    shares references to all of the inner containers of the previous value
 *    that were not affected by any of the mutations.
 *  * Not mutate the object tree in any way or delay the mutation
 *    until such time that calling code explicitly requested it,
 *    yet at the same time record all the requested mutations in a
 *    fine grained primitives-based summary of the changes to perform
 *    with their path in the object tree and and give access to them to the calling code
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
  set<T, A extends AccessorFunction<R, T>>(accessor: A, value: ValueTransformer<A>): this;

  /**
   * Set subproperty value using accessor chain
   */
  set<T, A extends AccessPath>(accessor: A, value: ValueTransformer<A>): this;

  /**
   * Set subproperty value
   */
  set<T, A extends Accessor<R, T>>(accessor: A, value: ValueTransformer<A>): this {
    this.mutations.push([getAccessorPath(accessor), value]);
    return this;
  }

  self<A extends UnitAccessor<R>>(value: ValueTransformer<A>): this {
    return this.set(self, value);
  }

  selfNow<A extends UnitAccessor<R>>(value: ValueTransformer<A>): this {
    this.set(self, value).engage();
    return this;
  }

  setNow<T, A extends AccessPath>(accessor: A, value: ValueTransformer<A>): this;
  setNow<T, A extends AccessorFunction<R, T>>(accessor: A, value: ValueTransformer<A>): this;
  setNow<T, A extends Accessor<R, T>>(accessor: A, value: ValueTransformer<A>): this {
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
export function setStateMutator<R>([state, setState]: [R, any]): Mutagen<R> {
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
      freeze(() => {
        map.forEach((i) => setState(...i));
      });
      return state;
    }
  );
}

/**
 * Update immutable tree
 */
export function set<R, T, A extends Accessor<R, T>>(
  root: R,
  accessor: A,
  value?: ValueTransformer<A>
): R {
  const access = accessor as Accessor<R, T>;
  return setFromAccessorChain(
    root,
    isAccessFunc(access) ? getAccessFuncPath(() => root, access) : (accessor as AccessPath),
    value
  );
}
