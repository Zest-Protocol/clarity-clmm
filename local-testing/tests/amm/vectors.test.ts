/**
 * Differential tests: every vector in tests/vectors/pool-math.json was computed
 * independently in exact arithmetic. The contract's pure
 * read-only functions must agree bit for bit, including which inputs fail
 * and with which error code.
 */
import { readFileSync } from 'node:fs';
import { Cl, type ClarityValue } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import { plain } from '../lib/clarity';
import { deployer } from '../lib/protocol';

type Res<T> = { ok: T } | { err: string };
interface Vectors {
  muldiv: {
    a: string;
    b: string;
    d: string;
    down: Res<string>;
    up: Res<string>;
  }[];
  sqrtprice: {
    bin: string;
    tick: string;
    res: Res<{ mu: string; eps: string }>;
  }[];
  liquidity: {
    bin: string;
    tick: string;
    x: string;
    y: string;
    res: Res<string>;
  }[];
  swap: {
    bin: string;
    tick: string;
    x: string;
    y: string;
    gross: string;
    fee: string;
    xy: boolean;
    limit: string;
    res: Res<{ in: string; out: string; fee: string }>;
  }[];
  deposit: {
    bin: string;
    tick: string;
    x: string;
    y: string;
    supply: string;
    dx: string;
    dy: string;
    fx: string;
    fy: string;
    rebate: string;
    res: Res<Record<string, string>>;
  }[];
}

const V: Vectors = JSON.parse(
  readFileSync(new URL('../vectors/pool-math.json', import.meta.url), 'utf8'),
);

/** Model result (strings) -> the plain shape the contract returns. */
function expected(res: Res<unknown>): unknown {
  const conv = (v: unknown): unknown =>
    typeof v === 'string'
      ? BigInt(v)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]))
        : v;
  return 'ok' in res ? { ok: conv(res.ok) } : { err: BigInt(res.err) };
}

const pool = (fn: string, args: ClarityValue[]) =>
  plain(simnet.callReadOnlyFn('clmm-pool-v1', fn, args, deployer()).result);
const u = (v: string) => Cl.uint(BigInt(v));
const i = (v: string) => Cl.int(BigInt(v));

describe('clmm-pool-v1 matches the precomputed vectors bit for bit', {
  timeout: 300_000,
}, () => {
  it(`mul-div / mul-div-up (${V.muldiv.length} vectors, both code paths)`, () => {
    for (const v of V.muldiv) {
      const args = [u(v.a), u(v.b), u(v.d)];
      expect(pool('mul-div', args), JSON.stringify(v)).toEqual(
        expected(v.down),
      );
      expect(pool('mul-div-up', args), JSON.stringify(v)).toEqual(
        expected(v.up),
      );
    }
  });

  it(`sqrt prices (${V.sqrtprice.length} vectors, every bin step)`, () => {
    for (const v of V.sqrtprice) {
      expect(
        pool('get-sqrt-price', [u(v.bin), i(v.tick)]),
        JSON.stringify(v),
      ).toEqual(expected(v.res));
    }
  });

  it(`liquidity of reserves (${V.liquidity.length} vectors)`, () => {
    for (const v of V.liquidity) {
      expect(
        pool('get-bin-liquidity', [u(v.bin), i(v.tick), u(v.x), u(v.y)]),
        JSON.stringify(v),
      ).toEqual(expected(v.res));
    }
  });

  it(`swap steps in both directions (${V.swap.length} vectors)`, () => {
    for (const v of V.swap) {
      const fn = v.xy ? 'simulate-swap-x-for-y' : 'simulate-swap-y-for-x';
      const got = pool(fn, [
        u(v.bin),
        i(v.tick),
        u(v.x),
        u(v.y),
        u(v.gross),
        u(v.fee),
        u(v.limit),
      ]);
      expect(got, JSON.stringify(v)).toEqual(expected(v.res));
    }
  });

  it(`deposits: fees and share minting (${V.deposit.length} vectors)`, () => {
    for (const v of V.deposit) {
      const got = pool('simulate-deposit', [
        u(v.bin),
        i(v.tick),
        u(v.x),
        u(v.y),
        u(v.supply),
        u(v.dx),
        u(v.dy),
        u(v.fx),
        u(v.fy),
        u(v.rebate),
      ]);
      expect(got, JSON.stringify(v)).toEqual(expected(v.res));
    }
  });
});
