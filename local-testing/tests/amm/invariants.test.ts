/**
 * Stateful randomized test: a seeded sequence of deposits, withdrawals and
 * swaps by several wallets over two pools (different bin steps and token
 * decimals). After every operation the protocol must satisfy:
 *
 *  I1  token conservation: the pool holds exactly the bins' reserves plus the
 *      protocol fees, for every token, to the last unit;
 *  I2  share accounting: the LP token supply of each bin equals the bin's
 *      recorded total supply;
 *  I3  prices stay inside their bins;
 *  I4  calls either succeed or fail with a known, clean error code
 *      (a Clarity runtime error would throw and fail the test).
 */
import { Cl, type ClarityValue } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import { errCode, okUint } from '../lib/clarity';
import {
  account,
  addLiquidity,
  balanceOf,
  bin,
  binPrice,
  bootstrap,
  contract,
  createPool,
  mint,
  ONE_8,
  type Pool,
  poolFees,
  removeLiquidity,
  ro,
  shares,
  swapXForY,
  swapYForX,
  tokenId,
} from '../lib/protocol';

/** xorshift128+ with BigInt, deterministic across runs */
function rng(seed: bigint) {
  let s0 = seed | 1n;
  let s1 =
    (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
  const mask = (1n << 64n) - 1n;
  return () => {
    let x = s0;
    const y = s1;
    s0 = y;
    x ^= (x << 23n) & mask;
    s1 = x ^ y ^ (x >> 17n) ^ (y >> 26n);
    return (s1 + y) & mask;
  };
}

const ALLOWED_ERRORS = new Set([
  2001n, // price outside the caller's window
  2005n, // nothing to withdraw
  2006n, // empty deposit
  2007n, // no such position
  2009n, // slippage
  3002n, // deposit too small to mint a share
  3005n, // amount beyond the bin's frame
]);

describe('protocol invariants under random operation sequences', () => {
  it('holds I1-I4 for 400 random operations', { timeout: 600_000 }, () => {
    bootstrap();
    const wallets = ['wallet_1', 'wallet_2', 'wallet_3', 'wallet_4'].map(
      account,
    );
    for (const w of wallets) {
      mint('mock-token-a', 10n ** 22n, w);
      mint('mock-token-b', 10n ** 18n, w);
      mint('mock-token-c', 10n ** 12n, w);
    }
    const pools: { pool: Pool; ticks: bigint[] }[] = [
      {
        pool: createPool(
          'mock-token-stx',
          'mock-token-a',
          100n,
          ONE_8 / 100n,
          ONE_8 / 400n,
          ONE_8 / 2n,
        ),
        ticks: [-2n, -1n, 0n, 1n, 2n],
      },
      {
        pool: createPool(
          'mock-token-c',
          'mock-token-b',
          2000n,
          ONE_8 / 50n,
          ONE_8 / 50n,
          ONE_8,
        ),
        ticks: [-1n, 0n, 1n, 40n],
      },
    ];
    const rand = rng(20261009n);
    const pick = <T>(xs: T[]): T => xs[Number(rand() % BigInt(xs.length))];
    const amount = (maxExp: number) => {
      const e = Number(rand() % BigInt(maxExp + 1));
      return rand() % (10n ** BigInt(e) + 1n);
    };
    const stats = { ok: 0, err: 0, swaps: 0 };

    for (let step = 0; step < 400; step++) {
      const { pool, ticks } = pick(pools);
      const tick = pick(ticks);
      const who = pick(wallets);
      const op = Number(rand() % 10n);
      let result: ClarityValue;
      if (op < 3)
        result = addLiquidity(pool, tick, amount(12), amount(12), who).result;
      else if (op < 5)
        result = removeLiquidity(pool, tick, (rand() % ONE_8) + 1n, who).result;
      else if (op < 7) result = swapXForY(pool, tick, amount(12), who).result;
      else result = swapYForX(pool, tick, amount(12), who).result;
      if (result.type === Cl.ok(Cl.bool(true)).type) {
        stats.ok++;
        if (op >= 5) stats.swaps++;
      } else {
        stats.err++;
        expect(
          ALLOWED_ERRORS.has(errCode(result)),
          `step ${step}: unexpected error u${errCode(result)}`,
        ).toBe(true);
      }

      for (const { pool: p, ticks: ts } of pools) {
        // I1
        let x = poolFees(p).x;
        let y = poolFees(p).y;
        for (const t of ts) {
          const b = bin(p, t);
          x += b.x;
          y += b.y;
          // I2
          expect(
            okUint(
              ro('clmm-lp-token-v1', 'get-total-supply', [
                Cl.uint(tokenId(p, t)),
              ]),
            ),
          ).toBe(b.supply);
          // I3
          if (b.x + b.y > 0n) {
            const price = binPrice(p, t);
            const start = emptyBinPrice(p, t);
            const end = emptyBinPrice(p, t + 1n);
            expect(
              (price * (10n ** 15n + 1n)) / 10n ** 15n + 1n,
            ).toBeGreaterThanOrEqual(start);
            expect(price).toBeLessThanOrEqual(
              (end * (10n ** 15n + 1n)) / 10n ** 15n + 1n,
            );
          }
        }
        expect(
          balanceOf(p.x, contract('clmm-pool-v1')),
          `step ${step} token x`,
        ).toBe(x);
        expect(
          balanceOf(p.y, contract('clmm-pool-v1')),
          `step ${step} token y`,
        ).toBe(y);
      }
    }
    // the sequence must actually exercise the protocol
    expect(stats.ok).toBeGreaterThan(200);
    expect(stats.swaps).toBeGreaterThan(80);
    // everybody can still exit every bin
    for (const { pool, ticks } of pools) {
      for (const t of ticks) {
        for (const w of wallets) {
          if (shares(pool, t, w) > 0n)
            expect(removeLiquidity(pool, t, ONE_8, w).result.type).toBe(
              Cl.ok(Cl.bool(true)).type,
            );
        }
      }
    }
  });
});

/** start price of a bin (its empty-bin price) in WAD */
function emptyBinPrice(pool: Pool, tick: bigint): bigint {
  const sp = ro('clmm-pool-v1', 'get-sqrt-price', [
    Cl.uint(pool.binStep),
    Cl.int(tick),
  ]);
  if (sp.type !== Cl.ok(Cl.bool(true)).type) throw new Error('sqrt price');
  const v = (
    sp as { value: { value: Record<string, { value: bigint | string }> } }
  ).value.value;
  const mu = BigInt(v.mu.value);
  const eps = BigInt(v.eps.value);
  const q = (mu * mu) >> 60n; // Q60 mantissa^2
  const p = (q * 10n ** 18n) >> 60n;
  return eps >= 0n ? p << (2n * eps) : p >> (-2n * eps);
}
