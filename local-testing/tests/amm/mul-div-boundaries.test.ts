// Boundary inputs for mul-div / mul-div-up: exact multiples, carries, the
// 2^128 edge, a zero divisor and slow-path rounding. Expected values are exact.
import { Cl, cvToString } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import { deployer } from '../lib/protocol';

const ro = (fn: string, args: ReturnType<typeof Cl.uint>[]) =>
  cvToString(
    simnet.callReadOnlyFn(`${deployer()}.clmm-pool-v1`, fn, args, deployer())
      .result,
  );
const u = (x: bigint) => Cl.uint(x);
const TWO64 = 1n << 64n;
const TWO127 = 1n << 127n;

describe('mul-div boundaries', () => {
  it('mul-div: exact multiple where the first digit lands on x = l', () => {
    expect(ro('mul-div', [u(TWO64), u(TWO127 + 1n), u(TWO127 + 1n)])).toBe(
      `(ok u${TWO64})`,
    );
  });
  // equal high word, low word below the estimate
  it('mul-div: equal high word with x < l', () => {
    expect(ro('mul-div', [u(TWO64), u(TWO127), u(TWO127 + 1n)])).toBe(
      `(ok u${TWO64 - 1n})`,
    );
  });
  it('mul-div: divisor >= 2^127 with a low word >= 2^127', () => {
    expect(
      ro('mul-div', [u(TWO64), u(TWO127 + (1n << 63n)), u(TWO127 + 1n)]),
    ).toBe(`(ok u${TWO64})`);
  });
  // hi = d: a quotient of exactly 2^128 is rejected
  it('mul-div: quotient exactly 2^128 gives err u3006', () => {
    expect(ro('mul-div', [u(TWO64), u(1n << 65n), u(2n)])).toBe('(err u3006)');
  });
  // a*b just above 2^128 must not abort
  it('mul-div: a = floor(MAX/b) + 1 with a*b > MAX gives err u3006, not a runtime error', () => {
    expect(ro('mul-div', [u(TWO64), u(TWO64), u(1n)])).toBe('(err u3006)');
  });
  // a zero divisor errs even with a zero numerator
  it('mul-div: zero divisor gives err u3006', () => {
    expect(ro('mul-div', [u(0n), u(1n), u(0n)])).toBe('(err u3006)');
  });
  it('mul-div-up: remainder exactly 1 on the slow path rounds up', () => {
    // 2^128 = 1 (mod 5): remainder 1, quotient (2^128 - 1)/5 < 2^128, so the ceiling is (2^128 + 4)/5
    const q = ((1n << 128n) + 4n) / 5n;
    expect(ro('mul-div-up', [u(1n << 64n), u(1n << 64n), u(5n)])).toBe(
      `(ok u${q})`,
    );
  });
  it('mul-div-up: ceiling reaching 2^128 gives err u3006', () => {
    // a*b = 7 * 97223533405982418132392744980505203273 = 2*MAX + 1: floor = MAX, remainder 1
    expect(
      ro('mul-div-up', [
        u(7n),
        u(97223533405982418132392744980505203273n),
        u(2n),
      ]),
    ).toBe('(err u3006)');
  });
  // exact quotient 2^127 with remainder 0 must not round up
  it('mul-div-up: exact slow-path quotient is not rounded up', () => {
    expect(ro('mul-div-up', [u(TWO64), u(TWO64), u(2n)])).toBe(
      `(ok u${1n << 127n})`,
    );
  });
});
