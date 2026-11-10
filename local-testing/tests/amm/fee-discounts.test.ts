/**
 * Partner fee discounts. Governance gives an address a percentage off a public
 * pool's fees; that address pays fee - floor(fee * discount / 1e8) on its
 * swaps, routes and deposits, and everyone else the pool's rate. Every path is
 * checked against the pool's own pure simulations at the expected rate, so a
 * discounted trade is exactly a trade in a pool with the lower fee.
 */
import { Cl, type ClarityValue } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, okOf, okRecord, plain } from '../lib/clarity';
import {
  account,
  addLiquidity,
  bin,
  bootstrap,
  call,
  createPool,
  deployer,
  FAR_DEADLINE,
  MAX_PRICE,
  mint,
  ONE_8,
  type Pool,
  poolFees,
  ro,
  swapXForY,
  swapYForX,
  token,
} from '../lib/protocol';

const lp = () => account('wallet_1');
const partner = () => account('wallet_2');
const other = () => account('wallet_3');
const FEE_X = 3_000_000n;
const FEE_Y = 1_000_000n;
const REBATE = 50_000_000n;

const effective = (fee: bigint, discount: bigint) =>
  fee - (fee * discount) / ONE_8;

function setDiscount(
  pool: Pool,
  who: string,
  discount: bigint,
  sender = deployer(),
) {
  return call(
    'clmm-pool-v1',
    'set-fee-discount',
    [Cl.uint(pool.id), Cl.principal(who), Cl.uint(discount)],
    sender,
  );
}

function feeRates(pool: Pool, who: string) {
  return okRecord(
    ro('clmm-pool-v1', 'get-fee-rates', [Cl.uint(pool.id), Cl.principal(who)]),
  );
}

function discounts(pool: Pool): bigint {
  const p = plain(ro('clmm-pool-v1', 'get-pool', [Cl.uint(pool.id)])) as Record<
    string,
    bigint
  >;
  return p.discounts;
}

function printed(events: unknown) {
  return (events as { event: string; data: { value?: ClarityValue } }[])
    .filter((e) => e.event === 'print_event' && e.data.value)
    .map((e) => plain(e.data.value as ClarityValue) as Record<string, unknown>);
}

/** One swap step simulated on the bin's current state at `rate`. */
function simulate(
  pool: Pool,
  tick: bigint,
  xIn: boolean,
  gross: bigint,
  rate: bigint,
) {
  const b = bin(pool, tick);
  return okRecord(
    ro(
      'clmm-pool-v1',
      xIn ? 'simulate-swap-x-for-y' : 'simulate-swap-y-for-x',
      [
        Cl.uint(pool.binStep),
        Cl.int(tick),
        Cl.uint(b.x),
        Cl.uint(b.y),
        Cl.uint(gross),
        Cl.uint(rate),
        Cl.uint(xIn ? MAX_PRICE : 0n),
      ],
    ),
  );
}

function simulateDeposit(
  pool: Pool,
  tick: bigint,
  dx: bigint,
  dy: bigint,
  rateX: bigint,
  rateY: bigint,
) {
  const b = bin(pool, tick);
  return okRecord(
    ro('clmm-pool-v1', 'simulate-deposit', [
      Cl.uint(pool.binStep),
      Cl.int(tick),
      Cl.uint(b.x),
      Cl.uint(b.y),
      Cl.uint(b.supply),
      Cl.uint(dx),
      Cl.uint(dy),
      Cl.uint(rateX),
      Cl.uint(rateY),
      Cl.uint(REBATE),
    ]),
  );
}

function routeX(pool: Pool, ticks: bigint[], dx: bigint, sender: string) {
  return call(
    'clmm-router-v1',
    'swap-x-for-y',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.uint(dx),
      Cl.uint(MAX_PRICE),
      Cl.list(ticks.map((t) => Cl.int(t))),
      Cl.uint(0),
      Cl.bool(true),
      Cl.uint(FAR_DEADLINE),
    ],
    sender,
  );
}

describe('partner fee discounts', () => {
  let pool: Pool;
  beforeEach(() => {
    bootstrap();
    for (const w of [lp(), partner(), other()])
      for (const t of ['mock-token-a', 'mock-token-b', 'mock-token-c'])
        mint(t, 10n ** 24n, w);
    pool = createPool(
      'mock-token-a',
      'mock-token-b',
      100n,
      FEE_X,
      FEE_Y,
      REBATE,
    );
    for (const t of [-2n, -1n, 0n, 1n, 2n])
      okRecord(addLiquidity(pool, t, 10n ** 15n, 10n ** 15n, lp()).result);
  });

  it('charges a partner the discounted rate on every path, others the pool rate', () => {
    const discount = 40_000_000n;
    okOf(setDiscount(pool, partner(), discount).result);
    for (const [who, rx, ry] of [
      [partner(), effective(FEE_X, discount), effective(FEE_Y, discount)],
      [other(), FEE_X, FEE_Y],
    ] as [string, bigint, bigint][]) {
      expect(feeRates(pool, who)).toEqual({
        'fee-rate-x': rx,
        'fee-rate-y': ry,
      });
      // single-bin swaps
      const sx = simulate(pool, 0n, true, 10n ** 12n, rx);
      const rs = swapXForY(pool, 0n, 10n ** 12n, who);
      expect(okRecord(rs.result)).toEqual({
        dx: sx.in,
        dy: sx.out,
        fee: sx.fee,
      });
      expect(printed(rs.events)[0]['fee-rate']).toBe(rx);
      const sy = simulate(pool, 0n, false, 10n ** 12n, ry);
      expect(okRecord(swapYForX(pool, 0n, 10n ** 12n, who).result)).toEqual({
        dx: sy.out,
        dy: sy.in,
        fee: sy.fee,
      });
      // a deposit that pays the implicit-swap fee in both tokens' terms
      const sd = simulateDeposit(pool, 0n, 10n ** 13n, 0n, rx, ry);
      const added = addLiquidity(pool, 0n, 10n ** 13n, 0n, who);
      const a = okRecord(added.result);
      expect(sd['fee-x']).toBeGreaterThan(0n);
      expect({ shares: a.shares, fx: a['fee-x'], fy: a['fee-y'] }).toEqual({
        shares: sd.shares,
        fx: sd['fee-x'],
        fy: sd['fee-y'],
      });
      expect(printed(added.events).at(-1)).toMatchObject({
        'fee-rate-x': rx,
        'fee-rate-y': ry,
      });
      // a route through the router: each bin a step at the same rate
      const ticks = [0n, 1n, 2n];
      let left = 10n ** 15n;
      let out = 0n;
      let fee = 0n;
      for (const t of ticks) {
        const s = simulate(pool, t, true, left, rx);
        left -= s.in;
        out += s.out;
        fee += s.fee;
      }
      const route = routeX(pool, ticks, 10n ** 15n, who);
      expect(okRecord(route.result)).toEqual({
        dx: 10n ** 15n - left,
        dy: out,
        fee,
      });
      expect(printed(route.events).at(-1)?.['fee-rate']).toBe(rx);
    }
  });

  it('100% off charges nothing and adds nothing to the protocol fees', () => {
    okOf(setDiscount(pool, partner(), ONE_8).result);
    const before = poolFees(pool);
    expect(
      okRecord(swapXForY(pool, 0n, 10n ** 12n, partner()).result).fee,
    ).toBe(0n);
    expect(
      okRecord(swapYForX(pool, 0n, 10n ** 12n, partner()).result).fee,
    ).toBe(0n);
    const a = okRecord(
      addLiquidity(pool, 0n, 10n ** 13n, 0n, partner()).result,
    );
    expect([a['fee-x'], a['fee-y']]).toEqual([0n, 0n]);
    expect(poolFees(pool)).toEqual(before);
    // everyone else still pays
    expect(
      okRecord(swapXForY(pool, 0n, 10n ** 12n, other()).result).fee,
    ).toBeGreaterThan(0n);
  });

  it('counts the discounts set on a pool through set, change and remove', () => {
    expect(discounts(pool)).toBe(0n);
    okOf(setDiscount(pool, partner(), 10_000_000n).result);
    expect(discounts(pool)).toBe(1n);
    okOf(setDiscount(pool, partner(), 20_000_000n).result);
    expect(discounts(pool)).toBe(1n);
    okOf(setDiscount(pool, other(), 5_000_000n).result);
    expect(discounts(pool)).toBe(2n);
    okOf(setDiscount(pool, partner(), 0n).result);
    expect(discounts(pool)).toBe(1n);
    okOf(setDiscount(pool, partner(), 0n).result);
    expect(discounts(pool)).toBe(1n);
    okOf(setDiscount(pool, other(), 0n).result);
    expect(discounts(pool)).toBe(0n);
    expect(feeRates(pool, partner())).toEqual({
      'fee-rate-x': FEE_X,
      'fee-rate-y': FEE_Y,
    });
  });

  it('follows update-pool-fee, so a partner never pays more than the public rate', () => {
    const discount = 25_000_000n;
    okOf(setDiscount(pool, partner(), discount).result);
    for (const [fx, fy] of [
      [10_000_000n, 1n],
      [0n, 9_999_999n],
      [7n, 3n],
    ]) {
      okOf(
        call(
          'clmm-pool-v1',
          'update-pool-fee',
          [Cl.uint(pool.id), Cl.uint(fx), Cl.uint(fy), Cl.uint(REBATE)],
          deployer(),
        ).result,
      );
      const r = feeRates(pool, partner());
      expect(r).toEqual({
        'fee-rate-x': effective(fx, discount),
        'fee-rate-y': effective(fy, discount),
      });
      expect(r['fee-rate-x']).toBeLessThanOrEqual(fx);
      expect(r['fee-rate-y']).toBeLessThanOrEqual(fy);
    }
  });

  it('is governance-only, public pools only, and at most 100%', () => {
    expect(errCode(setDiscount(pool, partner(), 1n, lp()).result)).toBe(1000n);
    expect(errCode(setDiscount(pool, partner(), ONE_8 + 1n).result)).toBe(
      2004n,
    );
    expect(
      errCode(setDiscount({ ...pool, id: 99n }, partner(), 1n).result),
    ).toBe(1003n);
    const created = call(
      'clmm-pool-v1',
      'create-private-pool',
      [
        token('mock-token-a'),
        token('mock-token-c'),
        Cl.uint(100),
        Cl.uint(FEE_X),
        Cl.uint(FEE_Y),
        Cl.uint(REBATE),
        Cl.principal(lp()),
      ],
      deployer(),
    );
    const priv = {
      id: okOf(created.result) as bigint,
      x: 'mock-token-a',
      y: 'mock-token-c',
      binStep: 100n,
    };
    expect(errCode(setDiscount(priv, partner(), 1n).result)).toBe(1007n);
    expect(discounts(priv)).toBe(0n);
  });

  it('quotes as a caller what that caller is charged; plain quotes give the pool rate', () => {
    const discount = 60_000_000n;
    okOf(setDiscount(pool, partner(), discount).result);
    const args = [
      Cl.uint(pool.id),
      Cl.int(0),
      Cl.uint(10n ** 12n),
      Cl.uint(MAX_PRICE),
    ];
    const plainQuote = okRecord(ro('clmm-pool-v1', 'quote-swap-x-for-y', args));
    expect(plainQuote).toEqual(simulate(pool, 0n, true, 10n ** 12n, FEE_X));
    const asPartner = okRecord(
      ro('clmm-pool-v1', 'quote-swap-x-for-y-as', [
        ...args,
        Cl.principal(partner()),
      ]),
    );
    expect(asPartner).toEqual(
      simulate(pool, 0n, true, 10n ** 12n, effective(FEE_X, discount)),
    );
    // each quote is taken on the state the action then runs on
    const sx = okRecord(swapXForY(pool, 0n, 10n ** 12n, partner()).result);
    expect(sx).toEqual({
      dx: asPartner.in,
      dy: asPartner.out,
      fee: asPartner.fee,
    });
    const yArgs = [
      Cl.uint(pool.id),
      Cl.int(0),
      Cl.uint(10n ** 12n),
      Cl.uint(0),
    ];
    const yQuote = okRecord(
      ro('clmm-pool-v1', 'quote-swap-y-for-x-as', [
        ...yArgs,
        Cl.principal(partner()),
      ]),
    );
    expect(yQuote).toEqual(
      simulate(pool, 0n, false, 10n ** 12n, effective(FEE_Y, discount)),
    );
    const sy = okRecord(swapYForX(pool, 0n, 10n ** 12n, partner()).result);
    expect(sy).toEqual({ dx: yQuote.out, dy: yQuote.in, fee: yQuote.fee });
    const depQuote = okRecord(
      ro('clmm-pool-v1', 'quote-add-to-position-as', [
        Cl.uint(pool.id),
        Cl.int(0),
        Cl.uint(10n ** 13n),
        Cl.uint(0),
        Cl.principal(partner()),
      ]),
    );
    expect(depQuote['fee-x']).toBeGreaterThan(0n);
    const added = okRecord(
      addLiquidity(pool, 0n, 10n ** 13n, 0n, partner()).result,
    );
    expect({
      shares: added.shares,
      fx: added['fee-x'],
      fy: added['fee-y'],
    }).toEqual({
      shares: depQuote.shares,
      fx: depQuote['fee-x'],
      fy: depQuote['fee-y'],
    });
  });

  it('applies per pool along a multi-pool route', () => {
    const second = createPool(
      'mock-token-b',
      'mock-token-c',
      100n,
      FEE_X,
      FEE_Y,
      REBATE,
    );
    for (const t of [-1n, 0n, 1n])
      okRecord(addLiquidity(second, t, 10n ** 15n, 10n ** 15n, lp()).result);
    const discount = 50_000_000n;
    okOf(setDiscount(pool, partner(), discount).result);
    const rs = call(
      'clmm-router-v1',
      'swap-routes',
      [
        Cl.list(
          ['mock-token-a', 'mock-token-b', 'mock-token-c'].map((t) => token(t)),
        ),
        Cl.list([
          Cl.tuple({
            'pool-id': Cl.uint(pool.id),
            ticks: Cl.list([0n, 1n].map((t) => Cl.int(t))),
            'x-for-y': Cl.bool(true),
          }),
          Cl.tuple({
            'pool-id': Cl.uint(second.id),
            ticks: Cl.list([0n, 1n].map((t) => Cl.int(t))),
            'x-for-y': Cl.bool(true),
          }),
        ]),
        Cl.uint(10n ** 12n),
        Cl.uint(0),
        Cl.uint(FAR_DEADLINE),
      ],
      partner(),
    );
    okOf(rs.result);
    const routes = printed(rs.events).filter(
      (e) => e.type === 'swap-x-for-y-route',
    );
    expect(routes.map((e) => e['fee-rate'])).toEqual([
      effective(FEE_X, discount),
      FEE_X,
    ]);
  });
});
