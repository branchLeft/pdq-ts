// Not part of the package and imported by nothing. The coverage control
// (vitest.coverage-control.config.mts) adds this file to what the gate
// measures; because no test runs it, the gate must fail.
export function unreached(flag: boolean): number {
  return flag ? 1 : 2;
}
