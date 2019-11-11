import { SetStateFunction } from "solid-js";
import { deepEqual, setInArray, setInObject } from "./utils";
import {
  Accessor,
  AccessorChain,
  AccessorFunction,
  AccessorTargetType,
  getAccessorChain,
  getFromAccessorChain,
  idPredicate,
  isAccessById,
  isAccessChain,
  isAccessFunc,
  locateById,
  self,
  UnitAccessor,
} from "./access";

export type ValueTransformer<A extends Accessor<any>> =
  | Partial<AccessorTargetType<A>>
  | AccessorTargetType<A>
  | ((value: AccessorTargetType<A>) => AccessorTargetType<A>);

export type ValueTransformTarget<T extends ValueTransformer<any>> = T extends ValueTransformer<
  infer A
>
  ? AccessorTargetType<A>
  : T;

export type Mutation = [AccessorChain, ValueTransformer<any>];
export type Mutations = Mutation[];
export type CommitMutations<R> = (root: R, m: Mutations) => R;

export function setFromAccessorChain<
  R extends any,
  A extends AccessorChain,
  V extends ValueTransformer<A>
>(root: R, accessorChain: A, value: V): R {
  if (accessorChain.length === 0) {
    // root is the target
    const newNode = typeof value === "function" ? value(root) : value;

    // Return root if structural equality
    return deepEqual(root, newNode) ? root : newNode;
  } else {
    // root is a parent of the target
    const [key, ...nextAccessors] = accessorChain;
    // if (typeof key == 'object' && Array.isArray(root)) {
    //   let range = key;
    //   if ('from' in range && 'to' in range) {
    //     const slice = root.slice(range.from, range.to);
    //   }
    // }
    if (isAccessById(key)) {
      const item = locateById(root, key[0]);
      return setFromAccessorChain(item, nextAccessors, value);
    }

    const newValue = setFromAccessorChain(root[key], nextAccessors, value);

    // Return root if identity equality
    return root[key] === newValue
      ? root
      : Array.isArray(root)
      ? setInArray(root, key, newValue)
      : setInObject(root, key, newValue);
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
    private baseChain: AccessorChain,
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
  set<T, A extends AccessorChain>(accessor: A, value: ValueTransformer<A>): this;

  /**
   * Set subproperty value
   */
  set<T, A extends Accessor<R, T>>(accessor: A, value: ValueTransformer<A>): this {
    let chain;
    const access = accessor as Accessor<R, T>;
    if (isAccessChain(access)) {
      chain = access;
    } else if (isAccessFunc(access)) {
      chain = getAccessorChain(this.value, access);
    } else {
      throw new Error("Unexpected accessor type");
    }
    this.mutations.push([chain, value]);
    return this;
  }

  setSelf<A extends UnitAccessor<R>>(value: ValueTransformer<A>): this {
    return this.set(self, value);
  }

  setSelfNow<A extends UnitAccessor<R>>(value: ValueTransformer<A>): this {
    this.set(self, value).engage();
    return this;
  }

  mutNow<T, A extends AccessorFunction<R, T>>(accessor: A, value: ValueTransformer<A>): this {
    this.set(accessor, value).engage();
    return this;
  }

  mutPathNow<T, A extends AccessorChain>(accessor: A, value: ValueTransformer<A>): this {
    this.set(accessor, value).engage();
    return this;
  }

  mut<T, A extends AccessorFunction<R, T>>(accessor: A): Mutagen<T> {
    const accessorChain = getAccessorChain(this.value, accessor);
    const nestedGetter = () => getFromAccessorChain(this.value(), accessorChain);
    const nestedBaseChain: AccessorChain = this.baseChain.concat(accessorChain);
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
export function setStateMutator<R>([state, setState]: [R, SetStateFunction<R>]): Mutagen<R> {
  return new Mutagen(() => state, [], [], (root, m) => {
    const map = m.map(([chain, value]) => [
      ...chain.map(part => (isAccessById(part) ? idPredicate(part[0]) : part)),
      value,
    ]);
    (setState as any)(...map);
    return state;
  });
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
    isAccessFunc(access) ? getAccessorChain(() => root, access) : (accessor as AccessorChain),
    value
  );
}
