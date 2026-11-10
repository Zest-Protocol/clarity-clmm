/**
 * Security properties of the pool: dust extraction, fee rounding, tick range,
 * very large pools, first-depositor inflation, tiny bins, native-unit
 * accounting, and hostile tokens against the asset allowances.
 */
import { Cl } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode } from '../lib/clarity';
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
  mint,
  ONE_8,
  okRecord,
  type Pool,
  poolFees,
  removeLiquidity,
  shares,
  swapXForY,
  swapYForX,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');
const POOL = () => contract('clmm-pool-v1');
const ZERO = { dx: 0n, dy: 0n, fee: 0n };

function conserved(pool: Pool, ticks: bigint[]) {
  let x = poolFees(pool).x;
  let y = poolFees(pool).y;
  for (const t of ticks) {
    x += bin(pool, t).x;
    y += bin(pool, t).y;
  }
  expect(balanceOf(pool.x, POOL())).toBe(x);
  expect(balanceOf(pool.y, POOL())).toBe(y);
}

beforeEach(() => {
  bootstrap();
  for (const w of [w1(), w2()]) {
    mint('mock-token-a', 10n ** 36n, w);
    mint('mock-token-b', 10n ** 36n, w);
    mint('mock-token-c', 10n ** 30n, w);
  }
});

describe('security properties', () => {
  it('a depleted output side takes no input', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    // deep bin at a low price, fully converted to X
    addLiquidity(pool, -407n, 7n * 10n ** 13n, 0n, w1());
    const before = balanceOf('mock-token-a', w2());
    expect(
      okRecord(swapXForY(pool, -407n, 7n * 10n ** 11n, w2()).result),
    ).toEqual(ZERO);
    expect(balanceOf('mock-token-a', w2())).toBe(before);
    conserved(pool, [-407n]);
  });

  it('dust trades cannot extract value at extreme prices', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 2000n, 0n, 0n, 0n); // zero fee
    addLiquidity(pool, 100n, 10n ** 18n, 10n ** 10n, w1()); // ~8.3e7 X per Y
    for (const dx of [1n, 2n, 100n, 10_000n]) {
      expect(okRecord(swapXForY(pool, 100n, dx, w2()).result)).toEqual(ZERO);
    }
    // 50 one-unit round trips leave the trader with no gain in either token
    const a0 = balanceOf('mock-token-a', w2());
    const b0 = balanceOf('mock-token-b', w2());
    for (let i = 0; i < 50; i++) {
      swapYForX(pool, 100n, 1n, w2());
      swapXForY(pool, 100n, 10n ** 8n, w2());
    }
    const gainA = balanceOf('mock-token-a', w2()) - a0;
    const gainB = balanceOf('mock-token-b', w2()) - b0;
    expect(gainA > 0n && gainB >= 0n).toBe(false);
    expect(gainB > 0n && gainA >= 0n).toBe(false);
    conserved(pool, [100n]);
  });

  it('fees round up, so splitting a trade never pays less fee', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 0n, 10n ** 15n, 10n ** 15n, w1());
    // a 99-raw trade at 1% executes nothing or pays a fee >= 1
    for (const dx of [1n, 50n, 99n, 100n, 101n]) {
      const r = okRecord(swapXForY(pool, 0n, dx, w2()).result);
      if (r.dx > 0n) expect(r.fee).toBeGreaterThanOrEqual(1n);
    }
    const whole = okRecord(swapXForY(pool, 0n, 990n, w2()).result).fee;
    let split = 0n;
    for (let i = 0; i < 10; i++)
      split += okRecord(swapXForY(pool, 0n, 99n, w2()).result).fee;
    expect(split).toBeGreaterThanOrEqual(whole);
  });

  it('the whole declared tick range works and beyond it fails cleanly', () => {
    for (const [step, max] of [
      [100n, 4458n],
      [500n, 909n],
      [1000n, 465n],
      [2000n, 243n],
    ] as const) {
      const pool = createPool('mock-token-a', 'mock-token-b', step);
      for (const t of [max, -max]) {
        expect(
          okRecord(addLiquidity(pool, t, 10n ** 12n, 10n ** 12n, w1()).result)
            .shares,
        ).toBeGreaterThan(0n);
        expect(
          okRecord(swapXForY(pool, t, 10n ** 9n, w2()).result).dy,
        ).toBeGreaterThanOrEqual(0n);
        expect(
          okRecord(swapYForX(pool, t, 10n ** 9n, w2()).result).dx,
        ).toBeGreaterThanOrEqual(0n);
      }
      expect(errCode(addLiquidity(pool, max + 1n, 1n, 1n, w1()).result)).toBe(
        3004n,
      );
      expect(errCode(swapXForY(pool, -(max + 1n), 1n, w2()).result)).toBe(
        3004n,
      );
    }
  });

  it('very large pools (1e30 per side) trade normally; the frame bound is a clean error', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 0n, 10n ** 30n, 10n ** 30n, w1());
    const r = okRecord(swapXForY(pool, 0n, 10n ** 27n, w2()).result);
    expect(r.dy).toBeGreaterThan(9n * 10n ** 26n);
    expect(
      okRecord(swapYForX(pool, 0n, 10n ** 27n, w2()).result).dx,
    ).toBeGreaterThan(9n * 10n ** 26n);
    expect(
      errCode(addLiquidity(pool, 0n, 4n * 10n ** 35n, 0n, w1()).result),
    ).toBe(3005n); // > 2^118 after fees
    expect(
      okRecord(removeLiquidity(pool, 0n, ONE_8, w1()).result).shares,
    ).toBeGreaterThan(0n);
    conserved(pool, [0n]);
  });

  it('first-depositor inflation is unprofitable thanks to locked shares', () => {
    const pool = createPool(
      'mock-token-a',
      'mock-token-b',
      100n,
      ONE_8 / 100n,
      ONE_8 / 100n,
      ONE_8,
    ); // 100% rebate
    const attacker = w1();
    const a0 =
      balanceOf('mock-token-a', attacker) + balanceOf('mock-token-b', attacker);
    // smallest deposit that mints anything beyond the locked shares
    let seed = 1n;
    while (
      addLiquidity(pool, 0n, seed, seed, attacker).result.type !==
      Cl.ok(Cl.bool(true)).type
    )
      seed *= 2n;
    // inflate the bin with fee-paying round trips (all fees stay in the bin)
    for (let i = 0; i < 30; i++) {
      swapXForY(pool, 0n, 10n ** 9n, attacker);
      swapYForX(pool, 0n, 10n ** 9n, attacker);
    }
    // the victim deposits; their shares are worth what they paid (within 1e-6)
    const victim = w2();
    const dep = 10n ** 10n;
    const minted = okRecord(
      addLiquidity(pool, 0n, dep, dep, victim).result,
    ).shares;
    const b = bin(pool, 0n);
    const worthX = (b.x * minted) / b.supply;
    const worthY = (b.y * minted) / b.supply;
    expect(worthX + worthY).toBeGreaterThan((2n * dep * 999_999n) / 1_000_000n);
    // and the attacker is net down: the locked shares absorbed their fees
    removeLiquidity(pool, 0n, ONE_8, attacker);
    expect(
      balanceOf('mock-token-a', attacker) + balanceOf('mock-token-b', attacker),
    ).toBeLessThan(a0);
    expect(shares(pool, 0n, POOL())).toBe(1000n);
  });

  it('tiny bins trade in both directions', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n, 0n, 0n, 0n);
    addLiquidity(pool, 0n, 10_000n, 10_000n, w1());
    expect(
      okRecord(swapXForY(pool, 0n, 1_000n, w2()).result).dy,
    ).toBeGreaterThan(0n);
    expect(
      okRecord(swapYForX(pool, 0n, 1_000n, w2()).result).dx,
    ).toBeGreaterThan(0n);
    conserved(pool, [0n]);
  });

  it('native-unit accounting credits exactly what moved, including STX', () => {
    const pool = createPool('mock-token-stx', 'mock-token-a', 500n);
    addLiquidity(pool, 2n, 10n ** 12n, 10n ** 12n, w1());
    for (const dx of [1n, 99n, 199n, 12_345n]) swapXForY(pool, 2n, dx, w2());
    for (const dy of [1n, 77n, 10n ** 6n]) swapYForX(pool, 2n, dy, w2());
    conserved(pool, [2n]); // the pool's STX balance equals the bin's x plus fees
  });

  it('zero-decimal tokens trade without dust leaks', () => {
    const pool = createPool(
      'mock-token-c',
      'mock-token-b',
      100n,
      ONE_8 / 100n,
      ONE_8 / 100n,
      ONE_8 / 2n,
    );
    addLiquidity(pool, 10n, 1_000_000n, 1_000_000n, w1());
    for (let i = 0; i < 20; i++) {
      swapXForY(pool, 10n, 3n + BigInt(i), w2());
      swapYForX(pool, 10n, 5n + BigInt(i) * 7n, w2());
    }
    conserved(pool, [10n]);
  });
});

describe('Clarity 4 asset allowances contain a hostile token', () => {
  const setMode = (mode: number) =>
    expect(
      call('mock-token-evil', 'set-mode', [Cl.uint(mode)], deployer()).result,
    ).toEqual(Cl.ok(Cl.bool(true)));

  function evilPool() {
    mint('mock-token-evil', 10n ** 20n, w1());
    mint('mock-token-evil', 10n ** 20n, w2());
    const pool = createPool('mock-token-evil', 'mock-token-a', 100n);
    addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    // the pool also holds an unrelated asset the evil token would like to take
    const other = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(other, 0n, 10n ** 12n, 10n ** 12n, w1());
    return pool;
  }

  it('a pull that moves more than requested reverts (restrict-assets? on the trader)', () => {
    const pool = evilPool();
    setMode(1); // transfer moves 2x
    expect(errCode(swapXForY(pool, 0n, 10n ** 9n, w2()).result)).toBe(0n); // allowance #0 violated
  });

  it('a pull that touches another asset of the trader reverts', () => {
    const pool = evilPool();
    setMode(2); // transfer also moves mock-token-a from the sender
    const a = balanceOf('mock-token-a', w2());
    expect(errCode(swapXForY(pool, 0n, 10n ** 9n, w2()).result)).toBe(128n); // asset without allowance
    expect(balanceOf('mock-token-a', w2())).toBe(a);
  });

  it('a payout that touches another pool asset reverts (as-contract? on the pool)', () => {
    const pool = evilPool();
    const held = balanceOf('mock-token-a', POOL());
    setMode(2); // paying evil out would also move mock-token-a out of the pool
    expect(errCode(swapYForX(pool, 0n, 10n ** 9n, w2()).result)).toBe(128n);
    expect(errCode(removeLiquidity(pool, 0n, ONE_8, w1()).result)).toBe(128n);
    expect(balanceOf('mock-token-a', POOL())).toBe(held);
    setMode(0); // once the token behaves again, LPs exit normally
    expect(
      okRecord(removeLiquidity(pool, 0n, ONE_8, w1()).result).shares,
    ).toBeGreaterThan(0n);
  });
});
