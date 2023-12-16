export function equalsEpsilon(epsilon: number): (prev: number, next: number) => boolean {
  return (a, b) => withinEpsilon(a, b, epsilon);
}
export function withinEpsilon(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) < epsilon;
}

