import { Cl } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode } from '../lib/clarity';
import {
  account,
  addLiquidity,
  balanceOf,
  bin,
  binPrice,
  bootstrap,
  call,
  contract,
  createPool,
  deployer,
  FAR_DEADLINE,
  mint,
  ONE_8,
  okRecord,
  okUint,
  type Pool,
  poolFees,
  removeLiquidity,
  ro,
  shares,
  swapXForY,
  swapYForX,
  token,
  WAD,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');
const POOL = () => contract('clmm-pool-v1');

/** The pool holds exactly the bins' reserves plus the protocol's fees. */
function expectConservation(pool: Pool, ticks: bigint[]) {
  const sum = ticks.reduce(
    (acc, t) => {
      const b = bin(pool, t);
      return { x: acc.x + b.x, y: acc.y + b.y };
    },
    { x: 0n, y: 0n },
  );
  const fees = poolFees(pool);
  expect(balanceOf(pool.x, POOL())).toBe(sum.x + fees.x);
  expect(balanceOf(pool.y, POOL())).toBe(sum.y + fees.y);
}

beforeEach(() => {
  bootstrap();
  for (const w of [w1(), w2()]) {
    mint('mock-token-a', 10n ** 20n, w);
    mint('mock-token-b', 10n ** 20n, w);
  }
});

describe('governance', () => {
  it('only the DAO or an extension can create and configure pools', () => {
    const args = [
      token('mock-token-a'),
      token('mock-token-b'),
      Cl.uint(100),
      Cl.uint(ONE_8 / 100n),
      Cl.uint(ONE_8 / 100n),
      Cl.uint(ONE_8 / 2n),
    ];
    expect(
      errCode(call('clmm-pool-v1', 'create-pool', args, w1()).result),
    ).toBe(1000n);
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'update-pool-fee',
          [Cl.uint(pool.id), Cl.uint(0), Cl.uint(0), Cl.uint(0)],
          w1(),
        ).result,
      ),
    ).toBe(1000n);
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'set-pool-status',
          [Cl.uint(pool.id), Cl.bool(true), Cl.bool(true)],
          w1(),
        ).result,
      ),
    ).toBe(1000n);
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'set-native-stx-token',
          [token('mock-token-a'), Cl.bool(true)],
          w1(),
        ).result,
      ),
    ).toBe(1000n);
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'claim-fees',
          [
            token('mock-token-a'),
            token('mock-token-b'),
            Cl.uint(pool.id),
            Cl.principal(w1()),
          ],
          w1(),
        ).result,
      ),
    ).toBe(1000n);
  });

  it('validates pool parameters', () => {
    const create = (
      x: string,
      y: string,
      step: number,
      fx: bigint,
      fy: bigint,
      rebate: bigint,
    ) =>
      call(
        'clmm-pool-v1',
        'create-pool',
        [
          token(x),
          token(y),
          Cl.uint(step),
          Cl.uint(fx),
          Cl.uint(fy),
          Cl.uint(rebate),
        ],
        deployer(),
      ).result;
    expect(
      errCode(create('mock-token-a', 'mock-token-b', 33, 0n, 0n, 0n)),
    ).toBe(2003n); // bin step
    expect(
      errCode(create('mock-token-a', 'mock-token-a', 100, 0n, 0n, 0n)),
    ).toBe(1004n); // same token
    expect(
      errCode(create('mock-token-a', 'mock-token-b', 100, ONE_8, 0n, 0n)),
    ).toBe(2008n); // fee >= 100%
    expect(
      errCode(create('mock-token-a', 'mock-token-b', 100, 0n, ONE_8, 0n)),
    ).toBe(2008n);
    expect(
      errCode(create('mock-token-a', 'mock-token-b', 100, 0n, 0n, ONE_8 + 1n)),
    ).toBe(2004n); // rebate > 100%
    for (const step of [100, 500, 1000, 2000]) {
      expect(
        create('mock-token-a', 'mock-token-b', step, 0n, 0n, ONE_8),
      ).toEqual(
        Cl.ok(
          Cl.uint(
            BigInt(step === 100 ? 1 : step === 500 ? 2 : step === 1000 ? 3 : 4),
          ),
        ),
      );
    }
    expect(
      errCode(create('mock-token-a', 'mock-token-b', 100, 0n, 0n, 0n)),
    ).toBe(2000n); // duplicate
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'update-pool-fee',
          [Cl.uint(99), Cl.uint(0), Cl.uint(0), Cl.uint(0)],
          deployer(),
        ).result,
      ),
    ).toBe(1003n);
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'update-pool-fee',
          [Cl.uint(1), Cl.uint(ONE_8), Cl.uint(0), Cl.uint(0)],
          deployer(),
        ).result,
      ),
    ).toBe(2008n);
  });

  it('proposals run through the executor-dao exactly once', () => {
    const run = () =>
      call(
        'devnet-bootstrap',
        'execute-proposal',
        [Cl.contractPrincipal(deployer(), 'devnet-test-proposal')],
        deployer(),
      ).result;
    expect(run()).toEqual(Cl.ok(Cl.bool(true)));
    expect(errCode(run())).toBe(1001n); // already executed
    expect(
      errCode(
        call(
          'executor-dao',
          'set-extension',
          [Cl.principal(w1()), Cl.bool(true)],
          w1(),
        ).result,
      ),
    ).toBe(1000n);
  });
});

describe('positions', () => {
  it('first deposit locks MIN-LIQUIDITY shares in the pool and prices the bin by its reserves', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    const r = okRecord(
      addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1()).result,
    );
    const b = bin(pool, 0n);
    expect(b).toEqual({
      x: 10n ** 12n,
      y: 10n ** 12n,
      supply: r.shares + 1000n,
    });
    expect(shares(pool, 0n, w1())).toBe(r.shares);
    expect(shares(pool, 0n, POOL())).toBe(1000n);
    expect(r['fee-x'] + r['fee-y']).toBe(0n);
    // balanced reserves sit at the geometric middle of [1, 1.01]
    const p = binPrice(pool, 0n);
    expect(p).toBeGreaterThan(WAD);
    expect(p).toBeLessThan((WAD * 101n) / 100n);
    expectConservation(pool, [0n]);
  });

  it('proportional deposits mint proportional shares; imbalance pays the swap fee', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    const first = okRecord(
      addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1()).result,
    );
    const second = okRecord(
      addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w2()).result,
    );
    // an in-ratio deposit swaps nothing and pays no fee
    expect(second['fee-x'] + second['fee-y']).toBe(0n);
    // equal deposits -> equal shares, up to the conservative 2^-49 margin
    const total = first.shares + 1000n;
    expect(second.shares).toBeLessThanOrEqual(total);
    expect(total - second.shares).toBeLessThan(total / 2n ** 40n + 10n);
    // A one-sided deposit is an implicit swap and pays the y fee rate on it.
    // The bin sits mid-range, so about half of the deposit is swapped:
    // n = (L0/L1)(y + dy) - y ~ 0.4975e10, gross n/(1 - 1%), fee 1% of that.
    const third = okRecord(addLiquidity(pool, 0n, 0n, 10n ** 10n, w2()).result);
    expect(third['fee-x']).toBe(0n);
    expect(third['fee-y']).toBe(50_253_938n);
    // 50% rebate to the existing LPs, the rest to the protocol
    expect(poolFees(pool)).toEqual({ x: 0n, y: 50_253_938n - 25_126_969n });
    expectConservation(pool, [0n]);
  });

  it('a dusted one-sided bin does not make a one-sided deposit pay the full fee', () => {
    // a fee measured as the excess per raw unit would let 4 raw X of dust in
    // a pure-Y bin charge a pure-Y deposit the fee on all of it
    const pool = createPool(
      'mock-token-a',
      'mock-token-b',
      100n,
      300_000n,
      300_000n,
      ONE_8,
    );
    addLiquidity(pool, 0n, 0n, 10n ** 18n, w1());
    expect(okRecord(swapXForY(pool, 0n, 4n, w1()).result).dx).toBe(4n);
    const dep = okRecord(addLiquidity(pool, 0n, 0n, 10n ** 18n, w2()).result);
    expect(dep['fee-y']).toBeLessThan(100n);
    expect(dep['fee-x']).toBe(0n);
    expectConservation(pool, [0n]);
  });

  it('enforces min-shares and the price window', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    const seed = okRecord(
      addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1()).result,
    );
    expect(
      errCode(
        addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w2(), {
          minShares: seed.shares + 2000n,
        }).result,
      ),
    ).toBe(2009n);
    // the derived bin price carries ~1e-18 relative noise, so windows are relative
    const p = binPrice(pool, 0n);
    const eps = p / 10n ** 9n;
    expect(
      errCode(
        addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w2(), {
          minPrice: p + eps,
        }).result,
      ),
    ).toBe(2001n);
    expect(
      errCode(
        addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w2(), {
          maxPrice: p - eps,
        }).result,
      ),
    ).toBe(2001n);
    expect(
      addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w2(), {
        minPrice: p - 10n ** 6n,
        maxPrice: p + 10n ** 6n,
      }).result.type,
    ).toBe(Cl.ok(Cl.bool(true)).type);
  });

  it('reduces positions proportionally with output floors', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 500n);
    okRecord(addLiquidity(pool, 3n, 4n * 10n ** 12n, 10n ** 12n, w1()).result);
    const before = bin(pool, 3n);
    const mine = shares(pool, 3n, w1());
    expect(errCode(removeLiquidity(pool, 3n, ONE_8 + 1n, w1()).result)).toBe(
      2004n,
    );
    expect(errCode(removeLiquidity(pool, 3n, 0n, w1()).result)).toBe(2005n);
    expect(errCode(removeLiquidity(pool, 4n, ONE_8, w1()).result)).toBe(2007n);
    expect(
      errCode(
        removeLiquidity(pool, 3n, ONE_8 / 4n, w1(), 10n ** 13n, 0n).result,
      ),
    ).toBe(2009n);
    const r = okRecord(removeLiquidity(pool, 3n, ONE_8 / 4n, w1()).result);
    expect(r.shares).toBe(mine / 4n);
    expect(r.dx).toBe((before.x * r.shares) / before.supply);
    expect(r.dy).toBe((before.y * r.shares) / before.supply);
    expectConservation(pool, [3n]);
  });

  it('pause stops swaps and deposits, sunset stops deposits; exits always work', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    const status = (sunset: boolean, paused: boolean) =>
      expect(
        call(
          'clmm-pool-v1',
          'set-pool-status',
          [Cl.uint(pool.id), Cl.bool(sunset), Cl.bool(paused)],
          deployer(),
        ).result,
      ).toEqual(Cl.ok(Cl.bool(true)));
    status(false, true);
    expect(errCode(swapXForY(pool, 0n, 10n ** 6n, w2()).result)).toBe(1001n);
    expect(errCode(swapYForX(pool, 0n, 10n ** 6n, w2()).result)).toBe(1001n);
    expect(errCode(addLiquidity(pool, 0n, 1n, 1n, w2()).result)).toBe(1001n);
    expect(
      okRecord(removeLiquidity(pool, 0n, ONE_8 / 2n, w1()).result).shares,
    ).toBeGreaterThan(0n);
    status(true, false);
    expect(errCode(addLiquidity(pool, 0n, 1n, 1n, w2()).result)).toBe(1002n);
    expect(
      okRecord(swapXForY(pool, 0n, 10n ** 6n, w2()).result).dy,
    ).toBeGreaterThan(0n);
    expect(
      okRecord(removeLiquidity(pool, 0n, ONE_8, w1()).result).shares,
    ).toBeGreaterThan(0n);
  });
});

describe('swaps', () => {
  it('charges the fee, splits it between LPs and protocol, and conserves tokens', () => {
    const pool = createPool(
      'mock-token-a',
      'mock-token-b',
      100n,
      ONE_8 / 100n,
      (3n * ONE_8) / 1000n,
      ONE_8 / 4n,
    );
    addLiquidity(pool, 0n, 10n ** 14n, 10n ** 14n, w1());
    const r = okRecord(swapXForY(pool, 0n, 10n ** 10n, w2()).result);
    expect(r.dx).toBe(10n ** 10n);
    expect(r.fee).toBe(10n ** 8n);
    expect(poolFees(pool)).toEqual({ x: 75_000_000n, y: 0n }); // 75% to protocol
    expect(bin(pool, 0n).x).toBe(10n ** 14n + 10n ** 10n - 75_000_000n);
    const s = okRecord(swapYForX(pool, 0n, 10n ** 10n, w2()).result);
    expect(s.fee).toBe(3n * 10n ** 7n); // 0.3% on y
    expectConservation(pool, [0n]);
  });

  it('respects the price limit and never trades past it', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 2000n);
    addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    const p0 = binPrice(pool, 0n);
    const limit = p0 + p0 / 50n; // +2%
    const r = okRecord(swapXForY(pool, 0n, 10n ** 13n, w2(), limit).result);
    expect(r.dx).toBeLessThan(10n ** 13n);
    // the trader's input executes at or below the limit ...
    expect(((r.dx - r.fee) * WAD) / r.dy).toBeLessThanOrEqual(limit);
    // ... and compounding the LP fee share (1% * 50%) into the reserves nudges
    // the resting price by at most that fraction of the move
    const move = limit - p0;
    expect(binPrice(pool, 0n)).toBeLessThanOrEqual(limit + move / 100n);
    // a limit at or below the current price is a no-op
    expect(
      okRecord(swapXForY(pool, 0n, 10n ** 9n, w2(), p0 - 1n).result),
    ).toEqual({ dx: 0n, dy: 0n, fee: 0n });
  });

  it('drains a bin to sub-rounding dust and then refuses to take input it cannot pay for', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 5n, 10n ** 12n, 10n ** 12n, w1());
    const b0 = bin(pool, 5n);
    const r = okRecord(swapXForY(pool, 5n, 10n ** 15n, w2()).result);
    // the step stops at the bin top: all y but sub-rounding dust (< 2^-48 L),
    // and the trader is charged only for what it received
    expect(r.dx).toBeLessThan(10n ** 15n);
    expect(bin(pool, 5n).y).toBeLessThanOrEqual(10n);
    expect(r.dy).toBe(b0.y - bin(pool, 5n).y);
    const balance = balanceOf('mock-token-a', w2());
    expect(okRecord(swapXForY(pool, 5n, 10n ** 12n, w2()).result)).toEqual({
      dx: 0n,
      dy: 0n,
      fee: 0n,
    });
    expect(balanceOf('mock-token-a', w2())).toBe(balance); // nothing taken
    // the bin now sits at its top price and trades back down
    expect(
      okRecord(swapYForX(pool, 5n, 10n ** 9n, w2()).result).dx,
    ).toBeGreaterThan(0n);
    expectConservation(pool, [5n]);
  });

  it('empty bins and wrong traits fail cleanly', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    expect(okRecord(swapXForY(pool, 7n, 10n ** 9n, w2()).result)).toEqual({
      dx: 0n,
      dy: 0n,
      fee: 0n,
    });
    expect(okRecord(swapYForX(pool, -7n, 10n ** 9n, w2()).result)).toEqual({
      dx: 0n,
      dy: 0n,
      fee: 0n,
    });
    const bad = call(
      'clmm-pool-v1',
      'swap-x-for-y-ioc',
      [
        token('mock-token-b'),
        token('mock-token-a'),
        Cl.uint(pool.id),
        Cl.int(0),
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(0),
        Cl.uint(FAR_DEADLINE),
      ],
      w2(),
    );
    expect(errCode(bad.result)).toBe(2002n);
    expect(errCode(swapXForY({ ...pool, id: 77n }, 0n, 1n, w2()).result)).toBe(
      1003n,
    );
  });

  it('quotes equal executions', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 500n);
    addLiquidity(pool, -2n, 3n * 10n ** 11n, 7n * 10n ** 11n, w1());
    const q = okRecord(
      ro('clmm-pool-v1', 'quote-swap-y-for-x', [
        Cl.uint(pool.id),
        Cl.int(-2),
        Cl.uint(10n ** 11n),
        Cl.uint(0),
      ]),
    );
    const r = okRecord(swapYForX(pool, -2n, 10n ** 11n, w2()).result);
    expect({ dx: r.dx, dy: r.dy, fee: r.fee }).toEqual({
      dx: q.out,
      dy: q.in,
      fee: q.fee,
    });
  });

  it('pays protocol fees to the DAO-chosen recipient once', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    swapXForY(pool, 0n, 10n ** 10n, w2());
    swapYForX(pool, 0n, 10n ** 10n, w2());
    const fees = poolFees(pool);
    const recipient = account('wallet_3');
    const claim = call(
      'clmm-pool-v1',
      'claim-fees',
      [token(pool.x), token(pool.y), Cl.uint(pool.id), Cl.principal(recipient)],
      deployer(),
    );
    expect(okRecord(claim.result)).toEqual({
      'fee-x': fees.x,
      'fee-y': fees.y,
    });
    expect(balanceOf(pool.x, recipient)).toBe(fees.x);
    expect(balanceOf(pool.y, recipient)).toBe(fees.y);
    expect(poolFees(pool)).toEqual({ x: 0n, y: 0n });
    expectConservation(pool, [0n]);
  });
});

describe('liquidity token', () => {
  it('only the pool mints and burns; owners transfer', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    const id = pool.id * 2n ** 64n + 2n ** 32n;
    expect(
      errCode(
        call(
          'clmm-lp-token-v1',
          'mint',
          [Cl.uint(id), Cl.uint(1), Cl.principal(w2())],
          w2(),
        ).result,
      ),
    ).toBe(1000n);
    // the owner can burn its own shares directly, nobody else can
    expect(
      errCode(
        call(
          'clmm-lp-token-v1',
          'burn',
          [Cl.uint(id), Cl.uint(1), Cl.principal(w1())],
          w2(),
        ).result,
      ),
    ).toBe(1000n);
    expect(
      call(
        'clmm-lp-token-v1',
        'transfer',
        [Cl.uint(id), Cl.uint(10), Cl.principal(w1()), Cl.principal(w2())],
        w1(),
      ).result,
    ).toEqual(Cl.ok(Cl.bool(true)));
    expect(
      okUint(
        ro('clmm-lp-token-v1', 'get-balance', [
          Cl.uint(id),
          Cl.principal(w2()),
        ]),
      ),
    ).toBe(10n);
    expect(
      errCode(
        call(
          'clmm-lp-token-v1',
          'transfer',
          [Cl.uint(id), Cl.uint(10), Cl.principal(w1()), Cl.principal(w2())],
          w2(),
        ).result,
      ),
    ).toBe(4n);
    // a recipient of shares in many bins keeps working normally
    expect(okRecord(removeLiquidity(pool, 0n, ONE_8, w2()).result).shares).toBe(
      10n,
    );
  });
});
