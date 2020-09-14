import { deepEqual, lazy } from "./utils";

export type AccessValue = string | number;
export type AccessIdType = string | number;
export type AccessSelector = "$all";
export type AccessPredicate = [AccessPath, AccessValue];
export type AccessBy = [AccessSelector] | AccessPredicate;
// single string or number by convention mean id (as in unique identifier)
export type AccessId = "id" | "guid" | "uuid";
export type HasId<T> = {
  [P in keyof T & AccessId]: AccessIdType;
};
export type IdType<T extends HasId<T>> = T[keyof T & AccessId];
export type AccessTo = { to: number };
export type AccessFrom = { from: number };
export type AccessRangeFull = AccessFrom & AccessTo;
export type AccessRange = AccessFrom | AccessTo | AccessRangeFull;
export type AccessPart = string | number | AccessBy;
export type AccessPath = AccessPart[];
export type AccessArrayById<T> = T extends HasId<T>
  ? {
      $byId<K extends IdType<T>>(id: K): Access<T>;
    }
  : never;

export type AccessArrayExt<T> = AccessArrayById<T> & {
  $all: Access<T>;
  $filter<K>(a: AccessorFunction<T, K>, v: K): Access<T>;
};

export type AccessArrayKeys = keyof AccessArrayExt<any>;
export type AccessKeyExt<T> = keyof T;
export type AccessKeys<T> = T extends AccessArrayTypes<any>
  ? AccessKeyExt<T> | AccessArrayKeys
  : AccessKeyExt<T>;
export type AccessArrayTypes<Item> = ReadonlyArray<Item> | Array<Item>;

export type AccessArrayValue<T, P extends AccessArrayKeys> = T extends AccessArrayTypes<infer Item>
  ? AccessArrayExt<Item>[P]
  : never;
export type AccessValueExt<T, P extends AccessKeys<T>> = never;
export type AccessPropValue<T, P extends keyof T> = T[P] extends Function ? never : Access<T[P]>;

export type Access<T> = NonNullable<T> &
  {
    readonly [P in AccessKeys<T>]-?: P extends keyof T
      ? AccessPropValue<T, P>
      : P extends AccessArrayKeys
      ? AccessArrayValue<T, P>
      : AccessValueExt<T, P>;
  };

export type AccessorFunction<R = any, T = any> = (root: Access<R>) => Access<T>;
export type Accessor<R, T = any> = AccessPath | AccessorFunction<R, T>;

export type UnwrapAccess<T> = T extends Access<infer R> ? R : T;

export type AccessorTargetType<A extends Accessor<any>> = A extends AccessorFunction<any, infer T>
  ? T
  : any;

export type UnitAccessor<T> = AccessorFunction<T, T>;

export const self: UnitAccessor<any> = (_) => _;

export function isAccessPath<R, T>(accessor: Accessor<R, T>): accessor is AccessPath {
  return Array.isArray(accessor);
}

export function isAccessFunc<R, T>(accessor: Accessor<R, T>): accessor is AccessorFunction<R, T> {
  return typeof accessor === "function";
}

export function isAccessKey(part: any): part is AccessIdType {
  return typeof part === "number" || typeof part === "string";
}

export function isAccessSelector(part: AccessPart): part is [AccessSelector] {
  return Array.isArray(part) && part.length === 1 && part[0] === "$all";
}

export function isAccessPredicate(part: AccessPart): part is AccessPredicate {
  return Array.isArray(part) && part.length === 2 && Array.isArray(part[0]);
}

/**
 * Transform accessor function to accessor chain
 * e.g. (_ => _.a.b.c) will return ['a', 'b', 'c']
 */
export function getAccessFuncPath<R, T>(root: () => R, accessor: AccessorFunction<R, T>) {
  /**
   * Return a Proxy that pushes accessors to accessPath, recursively
   */
  const createAccessPathFiller = <T>(root: () => T, accessPath: AccessPart[]): Access<any> => {
    const funcProxy = lazy(
      () =>
        new Proxy(() => {}, {
          apply(target: (...args: any[]) => any, thisArg: any, argArray?: any[]): any {
            if (argArray && argArray.length == 2) {
              const [access, value] = argArray;
              const path = getAccessFuncPath(root, access);
              accessPath.push([path, value]);
            }
          },
        })
    );
    const fillerProxy: ProxyHandler<any> = new Proxy(
      {},
      {
        get: (node: any, name: string) => {
          // Push current accessor to accessor chain
          if (name === "$all") {
            accessPath.push([name]);
            return fillerProxy;
          } else if (name === "$filter") {
            return funcProxy();
          }
          accessPath.push(name);
          // Fill accessors recursively
          return fillerProxy;
        },
      }
    );
    return fillerProxy;
  };

  const accessPath: AccessPart[] = [];
  const pathFiller = createAccessPathFiller(root, accessPath);

  // Fill accessor path
  accessor(pathFiller);
  return accessPath;
}

export function getAccessorPath<A extends Accessor<any>>(accessor: A): AccessPath {
  const access = accessor as Accessor<any>;
  if (isAccessPath(access)) {
    return access;
  } else if (isAccessFunc(access)) {
    return getAccessFuncPath(() => {}, access);
  } else {
    throw new Error("Unexpected accessor type");
  }
}

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

export function collectOrError<R = any>(
  root: R,
  f: (list: any[], item: any, index: number) => any[],
  error: () => Error
): any[] {
  if (Array.isArray(root)) {
    return root.reduce(f, []);
  } else {
    throw error();
  }
}

export function getFromAccessorChain<R extends any, A extends AccessPath>(
  root: R,
  accessorChain: A
): any {
  if (accessorChain.length === 0) {
    // root is the target
    return root;
  } else {
    // root is a parent of the target
    const [part, ...nextAccessors] = accessorChain;
    if (isAccessSelector(part)) {
      return collectOrError(
        root,
        (list, item) => {
          list.push(getFromAccessorChain(item, nextAccessors));
          return list;
        },
        () => new Error("Unexpected selector in path")
      );
    }
    if (isAccessPredicate(part)) {
      const [nestedPath, value] = part;
      return collectOrError(
        root,
        (list, item) => {
          const nestedValue = getFromAccessorChain(item, nestedPath);
          if (!deepEqual(nestedValue, value)) {
            return list;
          }
          list.push(item);
          return list;
        },
        () => new Error("Unexpected predicate in path")
      );
    }
    return getFromAccessorChain(root[part as keyof R], nextAccessors);
  }
}
