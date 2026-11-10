import { Cl } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, okOf } from '../lib/clarity';
import {
  account,
  addLiquidity,
  balanceOf,
  bin,
  bootstrap,
  call,
  createPool,
  FAR_DEADLINE,
  MAX_PRICE,
  mint,
  ONE_8,
  okRecord,
  type Pool,
  reducePositions,
  token,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');

beforeEach(() => {
  bootstrap();
  for (const w of [w1(), w2()]) {
    for (const t of ['mock-token-a', 'mock-token-b', 'mock-token-c'])
      mint(t, 10n ** 24n, w);
  }
});

const ticks = (ts: bigint[]) => Cl.list(ts.map((t) => Cl.int(t)));

function routeXY(
  pool: Pool,
  dx: bigint,
  ts: bigint[],
  minDy = 0n,
  partial = true,
  maxPrice = MAX_PRICE,
) {
  return call(
    'clmm-router-v1',
    'swap-x-for-y',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.uint(dx),
      Cl.uint(maxPrice),
      ticks(ts),
      Cl.uint(minDy),
      Cl.bool(partial),
      Cl.uint(FAR_DEADLINE),
    ],
    w2(),
  );
}

function routeYX(
  pool: Pool,
  dy: bigint,
  ts: bigint[],
  minDx = 0n,
  partial = true,
  minPrice = 0n,
) {
  return call(
    'clmm-router-v1',
    'swap-y-for-x',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.uint(dy),
      Cl.uint(minPrice),
      ticks(ts),
      Cl.uint(minDx),
      Cl.bool(partial),
      Cl.uint(FAR_DEADLINE),
    ],
    w2(),
  );
}

/** A ladder of single-sided bins: Y above the current price, X below. */
function ladder(pool: Pool) {
  for (const t of [1n, 2n, 3n]) addLiquidity(pool, t, 0n, 10n ** 12n, w1());
  for (const t of [-1n, -2n, -3n]) addLiquidity(pool, t, 10n ** 12n, 0n, w1());
}

describe('multi-bin swaps', () => {
  it('walks bins upwards, skipping empty ones', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    ladder(pool);
    // tick 0 is empty and sits on the path
    const r = okRecord(
      routeXY(pool, 25n * 10n ** 11n, [0n, 1n, 2n, 3n]).result,
    );
    expect(r.dx).toBe(25n * 10n ** 11n);
    // bins 1 and 2 are bought out (up to sub-rounding dust), bin 3 partly
    expect(bin(pool, 1n).y).toBeLessThanOrEqual(10n);
    expect(bin(pool, 2n).y).toBeLessThanOrEqual(10n);
    expect(bin(pool, 3n).y).toBeGreaterThan(10n ** 11n);
    const left = bin(pool, 1n).y + bin(pool, 2n).y + bin(pool, 3n).y;
    expect(r.dy).toBe(3n * 10n ** 12n - left);
  });

  it('walks bins downwards for Y -> X', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 500n);
    ladder(pool);
    const r = okRecord(
      routeYX(pool, 15n * 10n ** 11n, [0n, -1n, -2n, -3n]).result,
    );
    expect(r.dy).toBe(15n * 10n ** 11n);
    expect(bin(pool, -1n).x).toBeLessThanOrEqual(10n);
    expect(r.dx).toBeGreaterThan(10n ** 12n);
  });

  it('fill-or-kill and minimum output', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    ladder(pool);
    expect(
      errCode(routeXY(pool, 10n ** 14n, [1n, 2n, 3n], 0n, false).result),
    ).toBe(5001n);
    const quote = okRecord(routeXY(pool, 10n ** 11n, [1n], 0n, false).result);
    expect(
      errCode(routeXY(pool, 10n ** 11n, [1n], quote.dy * 2n, false).result),
    ).toBe(5002n);
  });

  it('a single price limit stops at the first bin above it (by design)', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 500n);
    for (const t of [25n, 30n, 35n])
      addLiquidity(pool, t, 4n * 10n ** 9n, 4n * 10n ** 9n, w1());
    // limit = end of the lowest bin: only that bin is used
    const end25 = (105n ** 26n * 10n ** 18n) / 100n ** 26n;
    const r = okRecord(
      routeXY(pool, 2n * 10n ** 10n, [25n, 30n, 35n], 0n, true, end25).result,
    );
    expect(r.dx).toBeLessThan(2n * 10n ** 10n);
    expect(bin(pool, 30n).x).toBe(4n * 10n ** 9n);
  });

  it('single-bin fill-or-kill', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    const fok = (dx: bigint) =>
      call(
        'clmm-router-v1',
        'swap-x-for-y-fok',
        [
          token(pool.x),
          token(pool.y),
          Cl.uint(pool.id),
          Cl.int(0),
          Cl.uint(dx),
          Cl.uint(MAX_PRICE),
          Cl.uint(0),
          Cl.uint(FAR_DEADLINE),
        ],
        w2(),
      );
    expect(okRecord(fok(10n ** 9n).result).dx).toBe(10n ** 9n);
    expect(errCode(fok(10n ** 14n).result)).toBe(5001n);
  });
});

describe('multi-pool routes', () => {
  it('routes A -> B -> C through two pools with a minimum output', () => {
    const ab = createPool('mock-token-a', 'mock-token-b', 100n);
    const cb = createPool('mock-token-c', 'mock-token-b', 100n);
    addLiquidity(ab, 0n, 10n ** 14n, 10n ** 14n, w1());
    addLiquidity(cb, 0n, 10n ** 14n, 10n ** 14n, w1());
    const route = (minOut: bigint) =>
      call(
        'clmm-router-v1',
        'swap-routes',
        [
          Cl.list([
            token('mock-token-a'),
            token('mock-token-b'),
            token('mock-token-c'),
          ]),
          Cl.list([
            Cl.tuple({
              'pool-id': Cl.uint(ab.id),
              ticks: ticks([0n]),
              'x-for-y': Cl.bool(true),
            }),
            Cl.tuple({
              'pool-id': Cl.uint(cb.id),
              ticks: ticks([0n]),
              'x-for-y': Cl.bool(false),
            }),
          ]),
          Cl.uint(10n ** 10n),
          Cl.uint(minOut),
          Cl.uint(FAR_DEADLINE),
        ],
        w2(),
      );
    const c0 = balanceOf('mock-token-c', w2());
    const r = okRecord(route(0n).result);
    expect(r['token-in']).toBe(10n ** 10n);
    expect(balanceOf('mock-token-c', w2()) - c0).toBe(r['token-out']);
    expect(r['token-out']).toBeGreaterThan((10n ** 10n * 97n) / 100n); // two 1% fees
    expect(errCode(route(10n ** 10n).result)).toBe(5002n);
  });

  it('rejects malformed routes', () => {
    const route = call(
      'clmm-router-v1',
      'swap-routes',
      [
        Cl.list([token('mock-token-a')]),
        Cl.list([
          Cl.tuple({
            'pool-id': Cl.uint(1),
            ticks: ticks([0n]),
            'x-for-y': Cl.bool(true),
          }),
        ]),
        Cl.uint(1),
        Cl.uint(0),
        Cl.uint(FAR_DEADLINE),
      ],
      w2(),
    );
    expect(errCode(route.result)).toBe(5003n);
  });
});

describe('batched positions', () => {
  it('adds and removes many bins in one transaction', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 1000n);
    const ts = [-2n, -1n, 0n, 1n, 2n];
    const added = call(
      'clmm-router-v1',
      'add-to-positions-many',
      [
        token(pool.x),
        token(pool.y),
        Cl.uint(pool.id),
        Cl.list(
          ts.map((t) =>
            Cl.tuple({
              tick: Cl.int(t),
              'max-x': Cl.uint(t <= 0n ? 10n ** 10n : 0n),
              'max-y': Cl.uint(t >= 0n ? 10n ** 10n : 0n),
              'min-price': Cl.uint(0),
              'max-price': Cl.uint(MAX_PRICE),
              'min-shares': Cl.uint(1),
            }),
          ),
        ),
      ],
      w1(),
    );
    const minted = okOf(added.result) as { shares: bigint }[];
    expect(minted.length).toBe(5);
    // the pool's batched withdrawal (the router does not redeem shares)
    const removed = okRecord(
      reducePositions(
        pool,
        ts.map((t) => ({ tick: t, percent: ONE_8 })),
        w1(),
      ).result,
    );
    expect(removed.shares).toBe(minted.reduce((s, m) => s + m.shares, 0n));
    for (const t of ts) expect(bin(pool, t).supply).toBe(1000n); // only the locked shares remain
  });
});
