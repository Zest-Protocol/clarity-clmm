/**
 * reduce-positions, the batched withdrawal, and get-bin-state.
 *
 * reduce-positions must equal reduce-position called bin by bin: on two
 * identical pools (A: a/b, B: c/b, same deposits and trades) the per-bin
 * withdrawals on A and one batch on B leave every bin, every share balance and
 * every token balance equal. It differs only in paying each token once and in
 * skipping a bin whose burn rounds to zero, where reduce-position reverts.
 */
import { Cl, type ClarityValue, cvToString } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, okOf, okRecord, plain } from '../lib/clarity';
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
  liquidity,
  mint,
  ONE_8,
  type Pool,
  removeLiquidity,
  ro,
  shares,
  swapXForY,
  swapYForX,
  token,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');

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

function reducePositions(
  pool: Pool,
  items: { tick: bigint; percent: bigint }[],
  sender: string,
  minDx = 0n,
  minDy = 0n,
  tokens: [string, string] = [pool.x, pool.y],
) {
  return call(
    'clmm-pool-v1',
    'reduce-positions',
    [
      token(tokens[0]),
      token(tokens[1]),
      Cl.uint(pool.id),
      Cl.list(
        items.map((i) =>
          Cl.tuple({ tick: Cl.int(i.tick), percent: Cl.uint(i.percent) }),
        ),
      ),
      Cl.uint(minDx),
      Cl.uint(minDy),
    ],
    sender,
  );
}

function transfers(events: { event: string }[]) {
  return events.filter((e) => e.event === 'ft_transfer_event').length;
}

describe('reduce-positions', () => {
  beforeEach(() => {
    bootstrap();
    for (const w of [w1(), w2()])
      for (const t of ['mock-token-a', 'mock-token-b', 'mock-token-c'])
        mint(t, 10n ** 24n, w);
  });

  it('equals reduce-position bin by bin', () => {
    for (const seed of [1, 2, 3]) {
      const r = rng(seed);
      const step = [100n, 500n, 1000n, 2000n][seed % 4];
      const A = createPool('mock-token-a', 'mock-token-b', step);
      const B = createPool('mock-token-c', 'mock-token-b', step);
      const ticks = Array.from({ length: 12 }, (_, i) => BigInt(i - 6));
      // drawn once, so both pools see the same deposits and trades
      const deposits = ticks.map((t) => ({
        dx: t <= 0n ? 10n ** BigInt(9 + Math.floor(r() * 9)) : 0n,
        dy: t >= 0n ? 10n ** BigInt(9 + Math.floor(r() * 9)) : 0n,
      }));
      for (const p of [A, B])
        ticks.forEach((t, i) => {
          const { dx, dy } = deposits[i];
          okRecord(addLiquidity(p, t, dx, dy, w1()).result);
          okRecord(addLiquidity(p, t, dx / 3n, dy / 3n, w2()).result);
        });
      const r2 = rng(seed * 7);
      const trades = ticks.map(() => ({
        dx: BigInt(Math.floor(r2() * 1e9)) + 1n,
        dy: BigInt(Math.floor(r2() * 1e9)) + 1n,
      }));
      for (const p of [A, B])
        ticks.forEach((t, i) => {
          swapXForY(p, t, trades[i].dx, w2());
          swapYForX(p, t, trades[i].dy, w2());
        });
      const r3 = rng(seed * 13);
      const items = ticks.map((t) => ({
        tick: t,
        percent: [ONE_8, ONE_8 / 2n, 1n, BigInt(Math.floor(r3() * 1e8)) + 1n][
          Math.floor(r3() * 4)
        ],
      }));
      const ax0 = balanceOf(A.x, w1());
      const ay0 = balanceOf(A.y, w1());
      const bx0 = balanceOf(B.x, w1());
      const by0 = balanceOf(B.y, w1());
      let shares0 = 0n;
      let dx0 = 0n;
      let dy0 = 0n;
      for (const i of items) {
        const one = removeLiquidity(A, i.tick, i.percent, w1());
        if (one.result.type === 'err') {
          // the batch skips a burn that rounds to zero
          expect(errCode(one.result)).toBe(2005n);
          continue;
        }
        const o = okRecord(one.result);
        shares0 += o.shares;
        dx0 += o.dx;
        dy0 += o.dy;
      }
      expect(shares0).toBeGreaterThan(0n);
      const batch = okRecord(reducePositions(B, items, w1()).result);
      expect(batch).toEqual({ shares: shares0, dx: dx0, dy: dy0 });
      for (const t of ticks) {
        expect(bin(B, t), `bin ${t} seed ${seed}`).toEqual(bin(A, t));
        expect(shares(B, t, w1())).toBe(shares(A, t, w1()));
      }
      expect(balanceOf(B.x, w1()) - bx0).toBe(balanceOf(A.x, w1()) - ax0);
      expect(balanceOf(B.y, w1()) - by0).toBe(balanceOf(A.y, w1()) - ay0);
    }
  });

  it('pays each token once and logs every bin', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    const ticks = [0n, 1n, 2n, 3n, 4n];
    for (const t of ticks)
      okRecord(addLiquidity(pool, t, 10n ** 12n, 10n ** 12n, w1()).result);
    const rs = reducePositions(
      pool,
      ticks.map((t) => ({ tick: t, percent: ONE_8 })),
      w1(),
    );
    okRecord(rs.result);
    expect(transfers(rs.events as never)).toBe(2);
    const prints = (
      rs.events as { event: string; data: { value?: ClarityValue } }[]
    )
      .filter((e) => e.event === 'print_event' && e.data.value)
      .map(
        (e) => (plain(e.data.value as ClarityValue) as { type: string }).type,
      );
    expect(prints.filter((t) => t === 'reduce-position').length).toBe(5);
    expect(prints.filter((t) => t === 'reduce-positions').length).toBe(1);
    for (const t of ticks) expect(shares(pool, t, w1())).toBe(0n);
  });

  it('skips a bin whose burn rounds to zero', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    okRecord(addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1()).result);
    okRecord(addLiquidity(pool, 1n, 0n, 10n ** 5n, w1()).result);
    const dust = shares(pool, 1n, w1());
    expect(dust).toBeLessThan(ONE_8);
    expect(errCode(removeLiquidity(pool, 1n, 1n, w1()).result)).toBe(2005n);
    const rs = reducePositions(
      pool,
      [
        { tick: 1n, percent: 1n },
        { tick: 0n, percent: ONE_8 },
      ],
      w1(),
    );
    expect(okRecord(rs.result).shares).toBeGreaterThan(0n);
    expect(shares(pool, 1n, w1())).toBe(dust);
    expect(shares(pool, 0n, w1())).toBe(0n);
    // an empty list, or only dust, withdraws nothing and pays nothing
    const none = reducePositions(pool, [{ tick: 1n, percent: 1n }], w1());
    expect(okRecord(none.result)).toEqual({ shares: 0n, dx: 0n, dy: 0n });
    expect(transfers(none.events as never)).toBe(0);
    expect(okRecord(reducePositions(pool, [], w1()).result)).toEqual({
      shares: 0n,
      dx: 0n,
      dy: 0n,
    });
  });

  it('works in paused and sunset pools', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    okRecord(addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1()).result);
    okOf(
      call(
        'clmm-pool-v1',
        'set-pool-status',
        [Cl.uint(pool.id), Cl.bool(true), Cl.bool(true)],
        deployer(),
      ).result,
    );
    okRecord(
      reducePositions(pool, [{ tick: 0n, percent: ONE_8 }], w1()).result,
    );
    expect(shares(pool, 0n, w1())).toBe(0n);
  });

  it('rejects bad items, wrong tokens and short outputs as a whole', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    okRecord(addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1()).result);
    const before = shares(pool, 0n, w1());
    const all = [{ tick: 0n, percent: ONE_8 }];
    expect(
      errCode(
        reducePositions(pool, [{ tick: 0n, percent: ONE_8 + 1n }], w1()).result,
      ),
    ).toBe(2004n);
    expect(
      errCode(
        reducePositions(pool, [...all, { tick: 7n, percent: ONE_8 }], w1())
          .result,
      ),
    ).toBe(2007n);
    expect(
      errCode(
        reducePositions(pool, all, w1(), 0n, 0n, [
          'mock-token-c',
          'mock-token-b',
        ]).result,
      ),
    ).toBe(2002n);
    expect(
      errCode(reducePositions(pool, all, w1(), 10n ** 13n, 0n).result),
    ).toBe(2009n);
    expect(
      errCode(reducePositions({ ...pool, id: 99n }, all, w1()).result),
    ).toBe(1003n);
    expect(shares(pool, 0n, w1())).toBe(before);
  });

  it('burns only the caller’s shares', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    okRecord(addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1()).result);
    okRecord(addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w2()).result);
    const theirs = shares(pool, 0n, w2());
    okRecord(
      reducePositions(pool, [{ tick: 0n, percent: ONE_8 }], w1()).result,
    );
    expect(shares(pool, 0n, w1())).toBe(0n);
    expect(shares(pool, 0n, w2())).toBe(theirs);
    expect(balanceOf(pool.x, contract('clmm-pool-v1'))).toBeGreaterThan(0n);
  });
});

describe('get-bin-state', () => {
  beforeEach(() => {
    bootstrap();
    for (const t of ['mock-token-a', 'mock-token-b']) mint(t, 10n ** 30n, w1());
  });

  it('equals get-pool-balances with get-bin-liquidity', () => {
    for (const step of [100n, 500n, 1000n, 2000n]) {
      const pool = createPool(
        step === 100n ? 'mock-token-a' : 'mock-token-b',
        step === 100n ? 'mock-token-b' : 'mock-token-a',
        step,
      );
      for (const [t, dx, dy] of [
        [0n, 10n ** 12n, 10n ** 12n],
        [3n, 0n, 10n ** 20n],
        [-5n, 10n ** 6n, 0n],
        [40n, 10n ** 15n, 10n ** 9n],
      ] as [bigint, bigint, bigint][]) {
        okRecord(addLiquidity(pool, t, dx, dy, w1()).result);
        const b = bin(pool, t);
        const state = okRecord(
          ro('clmm-pool-v1', 'get-bin-state', [Cl.uint(pool.id), Cl.int(t)]),
        );
        expect(state, `step ${step} tick ${t}`).toEqual({
          'balance-x': b.x,
          'balance-y': b.y,
          'total-supply': b.supply,
          liquidity: liquidity(step, t, b.x, b.y),
        });
      }
    }
  });

  it('reads an unused bin as empty and a missing pool as an error', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    expect(
      okRecord(
        ro('clmm-pool-v1', 'get-bin-state', [Cl.uint(pool.id), Cl.int(9)]),
      ),
    ).toEqual({
      'balance-x': 0n,
      'balance-y': 0n,
      'total-supply': 0n,
      liquidity: 0n,
    });
    expect(
      errCode(ro('clmm-pool-v1', 'get-bin-state', [Cl.uint(99), Cl.int(0)])),
    ).toBe(1003n);
    expect(
      cvToString(
        ro('clmm-pool-v1', 'get-bin-state', [Cl.uint(pool.id), Cl.int(5000)]),
      ),
    ).toBe('(err u3004)');
  });
});
