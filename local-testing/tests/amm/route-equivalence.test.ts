/**
 * Route equivalence: the pool-native multi-bin route (clmm-router-v1 over
 * clmm-pool-v1 swap-*-route) must equal the per-bin path (the test-only
 * per-bin-router-ref, which calls swap-*-ioc once per bin) on identical pools.
 *
 * One pool id cannot hold the same token pair twice, so the two pools differ
 * in their tokens (A: a/b, B: c/b) while every parameter, deposit and trade is
 * identical. Token balances are compared per role (x, y), so the comparison
 * holds for the native-STX configurations too (where x or y is mock-token-stx).
 *
 * After every route the results (ok values or error codes), every bin's state
 * over the tick range, the fee accumulators, the trader's and LP's balances and
 * the pool's own holdings must match exactly.
 */
import { Cl, cvToString } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, plain } from '../lib/clarity';
import {
  account,
  addLiquidity,
  balanceOf,
  bin,
  bootstrap,
  call,
  contract,
  createPool,
  deployer,
  FAR_DEADLINE,
  MAX_PRICE,
  mint,
  type Pool,
  poolFees,
  ro,
  token,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');
const WAD = 10n ** 18n;
const MAX_FRAME = 2n ** 118n;

/** Deterministic PRNG (mulberry32) so a failure replays exactly. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Price (WAD, raw X per raw Y) at the start of bin t for bin step 1%. */
function priceWad(t: number): bigint {
  if (t >= 0) return (101n ** BigInt(t) * WAD) / 100n ** BigInt(t);
  return (100n ** BigInt(-t) * WAD) / 101n ** BigInt(-t);
}

/** A limit strictly inside bin t (WAD). */
function limitIn(t: number, frac: number): bigint {
  const lo = priceWad(t);
  const hi = priceWad(t + 1);
  return lo + ((hi - lo) * BigInt(Math.floor(frac * 1_000_000))) / 1_000_000n;
}

type Config = {
  name: string;
  a: [string, string];
  b: [string, string];
  native?: string;
};

/** Pool A (reference) and pool B (route) use different tokens with the same roles. */
const CONFIGS: Config[] = [
  {
    name: 'plain',
    a: ['mock-token-a', 'mock-token-b'],
    b: ['mock-token-c', 'mock-token-b'],
  },
  {
    name: 'native x',
    a: ['mock-token-stx', 'mock-token-b'],
    b: ['mock-token-a', 'mock-token-b'],
    native: 'mock-token-stx',
  },
  {
    name: 'native y',
    a: ['mock-token-b', 'mock-token-stx'],
    b: ['mock-token-b', 'mock-token-a'],
    native: 'mock-token-stx',
  },
];

function makePools(cfg: Config): { A: Pool; B: Pool } {
  if (cfg.native) {
    const rs = call(
      'clmm-pool-v1',
      'set-native-stx-token',
      [token(cfg.native), Cl.bool(true)],
      deployer(),
    );
    expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
  }
  const fees = [2_000_000n, 1_500_000n, 50_000_000n] as const;
  const A = createPool(cfg.a[0], cfg.a[1], 100n, fees[0], fees[1], fees[2]);
  const B = createPool(cfg.b[0], cfg.b[1], 100n, fees[0], fees[1], fees[2]);
  return { A, B };
}

const ticksArg = (ts: bigint[]) => Cl.list(ts.map((t) => Cl.int(t)));

function refRoute(
  pool: Pool,
  xy: boolean,
  amount: bigint,
  ts: bigint[],
  limit: bigint,
  minOut: bigint,
  partial: boolean,
) {
  return call(
    'per-bin-router-ref',
    xy ? 'swap-x-for-y' : 'swap-y-for-x',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.uint(amount),
      Cl.uint(limit),
      ticksArg(ts),
      Cl.uint(minOut),
      Cl.bool(partial),
      Cl.uint(FAR_DEADLINE),
    ],
    w2(),
  );
}

function poolRoute(
  pool: Pool,
  xy: boolean,
  amount: bigint,
  ts: bigint[],
  limit: bigint,
  minOut: bigint,
  partial: boolean,
) {
  return call(
    'clmm-router-v1',
    xy ? 'swap-x-for-y' : 'swap-y-for-x',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.uint(amount),
      Cl.uint(limit),
      ticksArg(ts),
      Cl.uint(minOut),
      Cl.bool(partial),
      Cl.uint(FAR_DEADLINE),
    ],
    w2(),
  );
}

type Snap = { x: bigint[]; y: bigint[] };
/** Balances of the trader, the LP and the pool, per token role. */
const holders = () => [w1(), w2(), contract('clmm-pool-v1')];
function snapBalances(P: Pool): Snap {
  return {
    x: holders().map((who) => balanceOf(P.x, who)),
    y: holders().map((who) => balanceOf(P.y, who)),
  };
}

/**
 * Every observable of the two pools must agree: the route's own bins on every
 * call, the full tick window every `full` calls, the fee accumulators, and the
 * balance changes of each holder since `base` (native-STX balances start at a
 * different level from the mock tokens, so only changes are compared).
 */
function assertSameState(
  A: Pool,
  B: Pool,
  ticks: bigint[],
  where: string,
  full: boolean,
  base: { A: Snap; B: Snap },
) {
  const window = full
    ? Array.from({ length: 31 }, (_, i) => BigInt(i - 14))
    : [];
  for (const t of [...new Set([...window, ...ticks])]) {
    expect(bin(B, t), `${where}: bin ${t}`).toEqual(bin(A, t));
  }
  expect(poolFees(B), `${where}: fees`).toEqual(poolFees(A));
  const a = snapBalances(A);
  const b = snapBalances(B);
  const delta = (s: Snap, base: Snap, side: 'x' | 'y') =>
    s[side].map((v, i) => v - (base[side][i] as bigint));
  expect(delta(b, base.B, 'x'), `${where}: x holdings`).toEqual(
    delta(a, base.A, 'x'),
  );
  expect(delta(b, base.B, 'y'), `${where}: y holdings`).toEqual(
    delta(a, base.A, 'y'),
  );
}

/** Liquidity on the same bins of both pools, with the same calls. */
function deposit(A: Pool, B: Pool, t: bigint, dx: bigint, dy: bigint) {
  const ra = addLiquidity(A, t, dx, dy, w1());
  const rb = addLiquidity(B, t, dx, dy, w1());
  expect(cvToString(rb.result), `deposit ${t}`).toBe(cvToString(ra.result));
}

beforeEach(() => {
  bootstrap();
  for (const w of [w1(), w2()])
    for (const t of ['mock-token-a', 'mock-token-b', 'mock-token-c'])
      mint(t, 10n ** 24n, w);
});

describe('route equivalence: per-bin path vs pool-native route', () => {
  CONFIGS.forEach((cfg, index) => {
    it(`random routes, both directions (${cfg.name}): identical results, bins, fees, balances`, () => {
      const { A, B } = makePools(cfg);
      const rand = rng(0x5eed + 7919 * index);
      const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)] as T;
      const rint = (lo: number, hi: number) =>
        lo + Math.floor(rand() * (hi - lo + 1));
      const digits = (lo: number, hi: number) =>
        BigInt(Math.floor(10 ** (lo + rand() * (hi - lo))));

      // identical initial liquidity: one-sided and two-sided bins, sizes spread
      for (let t = -8; t <= 12; t++) {
        const r = rand();
        const size = digits(8, 12);
        if (r < 0.4) deposit(A, B, BigInt(t), 0n, size);
        else if (r < 0.7) deposit(A, B, BigInt(t), size, 0n);
        else deposit(A, B, BigInt(t), size, digits(8, 12));
      }

      const base = { A: snapBalances(A), B: snapBalances(B) };
      const stats = {
        ok: 0,
        partial: 0,
        full: 0,
        xy: 0,
        yx: 0,
        errors: {} as Record<string, number>,
      };
      const N = 110;
      for (let i = 0; i < N; i++) {
        if (i > 0 && i % 15 === 0) {
          // refresh liquidity identically (keeps bins diverse as they drain)
          const t = BigInt(rint(-10, 14));
          deposit(
            A,
            B,
            t,
            rand() < 0.5 ? 0n : digits(7, 12),
            rand() < 0.5 ? 0n : digits(7, 12),
          );
        }
        const xy = rand() < 0.5;
        stats[xy ? 'xy' : 'yx']++;
        const k = rint(1, 7);
        const span = xy ? [-6, 12] : [-12, 6];
        const pool = new Set<number>();
        while (pool.size < k)
          pool.add(rint(span[0] as number, span[1] as number));
        let ts = [...pool].sort((p, q) => (xy ? p - q : q - p)).map(BigInt);
        // a few malformed lists: repeated, unsorted or against the direction
        const bad = rand();
        if (bad < 0.03) ts = [ts[0] as bigint, ts[0] as bigint, ...ts.slice(1)];
        else if (bad < 0.05 && ts.length > 1) ts = [...ts].reverse();
        else if (bad < 0.06) ts = [...ts, 5000n]; // beyond the tick range

        const r = rand();
        const amount =
          r < 0.04
            ? 0n
            : r < 0.07
              ? MAX_FRAME
              : r < 0.2
                ? digits(13, 13)
                : digits(3, 13);
        const limitRoll = rand();
        const limit =
          limitRoll < 0.45
            ? xy
              ? MAX_PRICE
              : 0n
            : limitIn(Number(pick(ts)), rand());
        const minRoll = rand();
        const minOut = minRoll < 0.85 ? 0n : minRoll < 0.95 ? 1n : 2n ** 100n;
        const partial = rand() < 0.75;

        const ra = refRoute(A, xy, amount, ts, limit, minOut, partial);
        const rb = poolRoute(B, xy, amount, ts, limit, minOut, partial);
        const where = `route ${i} (${xy ? 'x->y' : 'y->x'} ${amount} ticks ${ts} limit ${limit} min ${minOut} partial ${partial})`;
        expect(cvToString(rb.result), where).toBe(cvToString(ra.result));
        const tsRange = ts.filter((t) => t <= 16n && t >= -14n);
        assertSameState(A, B, tsRange, where, i % 10 === 0, base);

        if (ra.result.type === Cl.ok(Cl.tuple({})).type) {
          stats.ok++;
          const got = cvToString(ra.result);
          const spent = /dx u(\d+)/.exec(got);
          if (spent && BigInt(spent[1] as string) < amount) stats.partial++;
          else if (amount > 0n) stats.full++;
        } else {
          const code = cvToString(ra.result);
          stats.errors[code] = (stats.errors[code] ?? 0) + 1;
        }
      }
      // the sample must exercise both directions, successes, partial and full fills, and errors
      expect(stats.xy).toBeGreaterThan(30);
      expect(stats.yx).toBeGreaterThan(30);
      expect(stats.ok).toBeGreaterThan(50);
      expect(stats.partial).toBeGreaterThan(0);
      expect(stats.full).toBeGreaterThan(0);
      expect(Object.keys(stats.errors).length).toBeGreaterThan(0);
    }, 900_000);
  });

  it('the native-STX flags are copied into the pool record at create-pool', () => {
    const rs = call(
      'clmm-pool-v1',
      'set-native-stx-token',
      [token('mock-token-stx'), Cl.bool(true)],
      deployer(),
    );
    expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
    const native = createPool('mock-token-stx', 'mock-token-b', 100n);
    const plainPool = createPool('mock-token-a', 'mock-token-b', 100n);
    const rec = (p: Pool) =>
      plain(ro('clmm-pool-v1', 'get-pool', [Cl.uint(p.id)])) as Record<
        string,
        unknown
      >;
    expect(rec(native)['native-x']).toBe(true);
    expect(rec(native)['native-y']).toBe(false);
    expect(rec(plainPool)['native-x']).toBe(false);
    expect(rec(plainPool)['native-y']).toBe(false);
    // once listed, the flag cannot change (the pool's payout path is fixed)
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'set-native-stx-token',
          [token('mock-token-stx'), Cl.bool(false)],
          deployer(),
        ).result,
      ),
    ).toBe(1005n);
  });

  it('ordering, pause, trait, tick range and zero input give the same codes', () => {
    const { A, B } = makePools(CONFIGS[0] as Config);
    deposit(A, B, 0n, 0n, 10n ** 12n);
    deposit(A, B, 1n, 0n, 10n ** 12n);
    deposit(A, B, -1n, 10n ** 12n, 0n);
    const same = (
      xy: boolean,
      amount: bigint,
      ts: bigint[],
      minOut = 0n,
      partial = true,
      limit = xy ? MAX_PRICE : 0n,
    ) => {
      const ra = refRoute(A, xy, amount, ts, limit, minOut, partial);
      const rb = poolRoute(B, xy, amount, ts, limit, minOut, partial);
      expect(cvToString(rb.result)).toBe(cvToString(ra.result));
      return cvToString(ra.result);
    };
    // unsorted, repeated and wrong-direction lists: 5003
    expect(same(true, 10n ** 9n, [1n, 0n])).toMatch(/u5003/);
    expect(same(true, 10n ** 9n, [0n, 0n, 1n])).toMatch(/u5003/);
    expect(same(false, 10n ** 9n, [0n, 1n])).toMatch(/u5003/);
    // a bin before the spent input is not ordered behind the others: still 5003
    expect(same(true, 10n ** 12n, [1n, 1n])).toMatch(/u5003/);
    // unfilled without partial: 5001; below minimum output: 5002
    expect(same(true, 10n ** 14n, [0n, 1n], 0n, false)).toMatch(/u5001/);
    expect(same(true, 10n ** 9n, [0n], 2n ** 100n, true)).toMatch(/u5002/);
    // tick out of range while input remains: 3004; after the input is spent it is ignored
    expect(same(true, 10n ** 9n, [5000n])).toMatch(/u3004/);
    expect(same(true, 10n ** 12n, [0n, 5000n])).toMatch(/\(ok/);
    // amount at the frame bound: 3005
    expect(same(true, MAX_FRAME, [0n])).toMatch(/u3005/);
    // zero input is a no-op in both
    expect(same(true, 0n, [0n, 1n])).toMatch(/\(ok/);

    // wrong token trait (x and y swapped): 2002
    const swapped = call(
      'clmm-router-v1',
      'swap-x-for-y',
      [
        token(B.y),
        token(B.x),
        Cl.uint(B.id),
        Cl.uint(10n ** 9n),
        Cl.uint(MAX_PRICE),
        ticksArg([0n]),
        Cl.uint(0n),
        Cl.bool(true),
        Cl.uint(FAR_DEADLINE),
      ],
      w2(),
    );
    expect(cvToString(swapped.result)).toMatch(/u2002/);

    // paused: both fail with 1001 once there is input to trade
    for (const p of [A, B]) {
      const rs = call(
        'clmm-pool-v1',
        'set-pool-status',
        [Cl.uint(p.id), Cl.bool(false), Cl.bool(true)],
        deployer(),
      );
      expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
    }
    expect(same(true, 10n ** 9n, [0n])).toMatch(/u1001/);
    expect(same(false, 10n ** 9n, [1n])).toMatch(/u1001/);
  });

  it('a route is one event, one pool fee write and one transfer each way', () => {
    const { A, B } = makePools(CONFIGS[0] as Config);
    for (let t = 0n; t <= 4n; t++) deposit(A, B, t, 0n, 10n ** 12n);
    const rb = poolRoute(
      B,
      true,
      10n ** 13n,
      [0n, 1n, 2n, 3n, 4n],
      MAX_PRICE,
      0n,
      true,
    );
    const ra = refRoute(
      A,
      true,
      10n ** 13n,
      [0n, 1n, 2n, 3n, 4n],
      MAX_PRICE,
      0n,
      true,
    );
    expect(cvToString(rb.result)).toBe(cvToString(ra.result));
    const printed = rb.events.filter(
      (e: { event: string }) => e.event === 'print_event',
    );
    expect(printed.length).toBe(1);
    const perBin = ra.events.filter(
      (e: { event: string }) => e.event === 'print_event',
    );
    expect(perBin.length).toBe(5);
    const transfers = (
      events: { event: string; data?: { sender?: string } }[],
    ) => events.filter((e) => e.event === 'ft_transfer_event').length;
    expect(transfers(rb.events as never)).toBe(2);
    expect(transfers(ra.events as never)).toBe(10);
    expect(balanceOf(B.x, w2())).toBe(balanceOf(A.x, w2()));
    expect(balanceOf(B.y, w2())).toBe(balanceOf(A.y, w2()));
  });
});
