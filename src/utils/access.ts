export type AccessPredicate<T = any> = AccessorFunction<T, boolean>;
export type AccessIdType = string | number;
export type AccessBy<T> = AccessIdType | AccessPredicate<T>;
// single string or number  by convention mean id (as in unique identificator)
export type AccessId = "id" | "guid" | "uuid";
export type HasId<T> = {
  [P in keyof T & AccessId]: AccessIdType;
};
export type AccessTo = { to: number };
export type AccessFrom = { from: number };
export type AccessRangeFull = AccessFrom & AccessTo;
export type AccessRange = AccessFrom | AccessTo | AccessRangeFull;
export type AccessPart = string | number | [AccessIdType];
export type AccessorChain = AccessPart[];
export type AccessArrayById<T, A = T[]> = T extends HasId<T>
  ? AccessArrayExt<T> & Access<A>
  : Access<A>;
export type AccessArrayExt<T> = {
  $all: Access<T>;
  $filter<K>(a: AccessorFunction<T, K>, v: K): Access<T>;
};

export type AccessArrayProp<A> = A extends Array<infer T> ? AccessArrayById<T, A> : Access<A>;

export type AccessArrayExtensionKeys = keyof AccessArrayExt<any>;
export type AccessKeys<T> = T extends readonly any[] ? keyof T | AccessArrayExtensionKeys : keyof T;
export type AccessValue<T, P extends AccessKeys<T>> = P extends AccessArrayExtensionKeys
  ? T extends ReadonlyArray<infer I> | Array<infer I>
    ? AccessArrayExt<I>[P]
    : never
  : T[Exclude<P, AccessArrayExtensionKeys>] extends Function
  ? never
  : Access<T[Exclude<P, AccessArrayExtensionKeys>]>;
export type Access<T> = Readonly<T> &
  NonNullable<T> &
  {
    [P in AccessKeys<T>]: AccessValue<T, P>;
  };

export type AccessorFunction<R = any, T = any> = (root: Access<R>) => Access<T>;
export type Accessor<R, T = any> = AccessorChain | AccessorFunction<R, T>;

export type UnwrapAccess<T> = T extends Access<infer R> ? R : T;

export type AccessorTargetType<A extends Accessor<any>> = A extends AccessorFunction<any, infer T>
  ? UnwrapAccess<T>
  : any;

export type UnitAccessor<T> = AccessorFunction<T, T>;

export const self: UnitAccessor<any> = _ => _;

export function isAccessChain<R, T>(accessor: Accessor<R, T>): accessor is AccessorChain {
  return Array.isArray(accessor);
}

export function isAccessFunc<R, T>(accessor: Accessor<R, T>): accessor is AccessorFunction<R, T> {
  return typeof accessor === "function";
}

export function isAccessKey(key: any): key is AccessIdType {
  return typeof key === "number" || typeof key === "string";
}

export function isAccessById(part: AccessPart): part is [AccessIdType] {
  return Array.isArray(part) && part.length === 1 && isAccessKey(part[0]);
}

/**
 * Return a Proxy that pushes accessors to accessorChain, recursively
 */
const createAccessorChainFiller = <T>(root: () => T, accessorChain: AccessPart[]): Access<any> => {
  const fillerProxy: ProxyHandler<any> = new Proxy(
    {},
    {
      get: (node: any, name: string) => {
        // Push current accessor to accessor chain
        accessorChain.push(name);
        // Fill accessors recursively
        return fillerProxy;
      },
    }
  );
  return fillerProxy;
};

export function idPredicate(id: string | number): (i: any) => boolean {
  return (i: any) =>
    ("id" in i && id === i["id"]) ||
    ("guid" in i && id === i["guid"]) ||
    ("uuid" in i && id === i["uuid"]);
}

export function locateById<R>(array: R, id: string | number): any {
  if (!Array.isArray(array)) {
    throw new Error("Unexpected container for id lookup");
  }
  return array.find(idPredicate(id));
}

/**
 * Transform accessor function to accessor chain
 * e.g. (_ => _.a.b.c) will return ['a', 'b', 'c']
 */
export const getAccessorChain = <R, T>(root: () => R, accessor: AccessorFunction<R, T>) => {
  const accessorChain: AccessPart[] = [];
  const accessorChainFiller = createAccessorChainFiller(root, accessorChain);

  // Fill accessor chain
  accessor(accessorChainFiller);
  return accessorChain;
};

export function getFromAccessorChain<R extends any, A extends AccessorChain>(
  root: R,
  accessorChain: A
): A extends [] ? R : any {
  if (accessorChain.length === 0) {
    // root is the target
    return root as any;
  } else {
    // root is a parent of the target
    const [key, ...nextAccessors] = accessorChain;
    if (!isAccessById(key)) {
      return getFromAccessorChain(root[key], nextAccessors);
    }
    const item = locateById(root, key[0]);
    return getFromAccessorChain(item, nextAccessors);
  }
}
