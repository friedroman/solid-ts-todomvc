export const setInObject = <O extends any, K extends keyof O, V extends O[K]>(
  object: O,
  key: K,
  value: V
): O =>
  Object.assign(Object.create(Object.getPrototypeOf(object)), object, {
    [key]: value,
  });
export const setInArray = <V>(array: V[], index: number, value: V) => [
  ...array.slice(0, Number(index)),
  value,
  ...array.slice(Number(index) + 1),
];
export const deepEqual = (a: any, b: any) => {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null) {
    return false;
  }
  if (Array.isArray(a)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return arrayEqual(a, b);
  }
  if (typeof a === "object") {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return objectEqual(a, b);
  }
  return a.valueOf() === b.valueOf();
};
export const arrayEqual = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
};

export const arrayEqualShallow = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

export const objectEqual = (a: any, b: any) : boolean => {
  const propsA = Object.getOwnPropertyNames(a);
  const propsB = Object.getOwnPropertyNames(b);

  if (propsA.length !== propsB.length) {
    return false;
  }

  for (const prop of propsA)
    if (!Object.prototype.hasOwnProperty.call(b, prop) || !deepEqual(a[prop], b[prop])) {
      return false;
    }

  return true;
};

export const lazy = <T>(init: () => T) => {
  let func: null | T = null;
  return () => {
    return func ? func : (func = init());
  };
};
