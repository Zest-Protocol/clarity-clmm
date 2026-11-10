/**
 * The client's exits: withdraw (part or all) and withdraw-ticks work with
 * the manager paused and with the pool paused or sunset, pay the client its
 * share of every bin plus idle, keep the manager's part as owed, skip bins
 * whose burn rounds to zero, never pay the fee recipient, and leave a full
 * exit holding no shares. Also the manager's removals and the 64-bin cap.
 */
import { Cl } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import {
  balanceOf,
  bin,
  call,
  deployer,
  MAX_FEE_RATE,
  ONE_8,
  shares,
  swapXForY,
  swapYForX,
} from '../lib/protocol';
import {
  addLiquidity,
  deposit,
  ERR,
  err,
  harvest,
  ok,
  position,
  printed,
  rebalance,
  removeLiquidity,
  setManagerFee,
  setupVault,
  totals,
  type Vault,
  vaultAddress,
  vcall,
  withdraw,
  withdrawTicks,
} from '../lib/vault';

const AMOUNT = 10n ** 14n;
const TICKS = [-1n, 0n, 1n];

/** The client deposits; the manager fills three bins (Y only, both, X only);
 * the trader trades through all of them, so every bin has a manager share. */
function funded(v: Vault) {
  ok(deposit(v, 10n * AMOUNT, 10n * AMOUNT));
  ok(addLiquidity(v, -1n, 0n, AMOUNT));
  ok(addLiquidity(v, 0n, AMOUNT, AMOUNT));
  ok(addLiquidity(v, 1n, AMOUNT, 0n));
  trade(v);
}

function trade(v: Vault, rounds = 3) {
  for (let r = 0; r < rounds; r++)
    for (const t of TICKS) {
      swapXForY(v.pool, t, AMOUNT / 7n, v.trader);
      swapYForX(v.pool, t, AMOUNT / 5n, v.trader);
    }
}

function setStatus(v: Vault, sunset: boolean, paused: boolean) {
  const rs = call(
    'clmm-pool-v1',
    'set-pool-status',
    [Cl.uint(v.pool.id), Cl.bool(sunset), Cl.bool(paused)],
    deployer(),
  );
  expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
}

const balances = (v: Vault, who: string) => [
  balanceOf(v.pool.x, who),
  balanceOf(v.pool.y, who),
];

/** What a 100% withdrawal must pay: each bin's client part plus idle, and
 * the manager parts that go to owed. */
function exitQuote() {
  const t = totals();
  let cx = t.idle.x;
  let cy = t.idle.y;
  let mx = 0n;
  let my = 0n;
  for (const tick of t.held) {
    const p = position(tick);
    cx += p['client-x'];
    cy += p['client-y'];
    mx += p['manager-x'];
    my += p['manager-y'];
  }
  return { cx, cy, mx, my, owed: t.owed, held: t.held };
}

function fullExit(v: Vault) {
  const q = exitQuote();
  const client = balances(v, v.client);
  const recipient = balances(v, v.recipient);
  const rs = withdraw(v);
  const r = ok(rs) as Record<string, bigint>;
  expect([r.dx, r.dy]).toEqual([q.cx, q.cy]);
  expect(balances(v, v.client)).toEqual([client[0] + q.cx, client[1] + q.cy]);
  expect(balances(v, v.recipient)).toEqual(recipient);
  const t = totals();
  expect(t).toEqual({
    idle: { x: 0n, y: 0n },
    owed: { x: q.owed.x + q.mx, y: q.owed.y + q.my },
    held: [],
  });
  for (const tick of q.held) {
    expect(shares(v.pool, tick, vaultAddress()), `bin ${tick}`).toBe(0n);
    expect(position(tick)).toMatchObject({ n: 0n, k: 0n, shares: 0n });
  }
  return rs;
}

describe('withdrawals', () => {
  it('a full exit pays every bin and idle, keeps the manager part owed and holds no shares', () => {
    const v = setupVault();
    funded(v);
    const rs = fullExit(v);
    const ev = printed(rs);
    expect(ev.filter((e) => e.type === 'remove-bin')).toHaveLength(3);
    expect(ev.at(-1)).toMatchObject({ type: 'withdraw', percent: ONE_8 });
    // the manager's part is paid by a later harvest
    const owed = totals().owed;
    expect(owed.x + owed.y).toBeGreaterThan(0n);
    const before = balances(v, v.recipient);
    expect(ok(harvest(v))).toMatchObject({
      shares: 0n,
      dx: owed.x,
      dy: owed.y,
    });
    expect(balances(v, v.recipient)).toEqual([
      before[0] + owed.x,
      before[1] + owed.y,
    ]);
  });

  it('a partial withdrawal takes the same share of every bin and of idle', () => {
    const v = setupVault();
    funded(v);
    const pct = 30_000_000n;
    const before = TICKS.map((t) => ({ p: position(t), b: bin(v.pool, t) }));
    const idle = totals().idle;
    const owed = totals().owed;
    const client = balances(v, v.client);
    const r = ok(withdraw(v, pct)) as Record<string, bigint>;
    let cx = (idle.x * pct) / ONE_8;
    let cy = (idle.y * pct) / ONE_8;
    let mx = 0n;
    let my = 0n;
    for (const [i, t] of TICKS.entries()) {
      const { p, b } = before[i];
      const h = p.shares;
      const sh = (h * pct) / ONE_8;
      // the pool's payout for the burn, of which m/h is the manager's
      const ox = (b.x * sh) / b.supply;
      const oy = (b.y * sh) / b.supply;
      const m = p['manager-shares'];
      mx += (ox * m) / h;
      my += (oy * m) / h;
      cx += ox - (ox * m) / h;
      cy += oy - (oy * m) / h;
      // N and K scale by the shares left, rounded up
      const after = position(t);
      const up = (a: bigint) => (a * (h - sh) + h - 1n) / h;
      expect(after.shares, `bin ${t}`).toBe(h - sh);
      expect([after.n, after.k], `bin ${t}`).toEqual([up(p.n), up(p.k)]);
    }
    expect([r.dx, r.dy]).toEqual([cx, cy]);
    expect(balances(v, v.client)).toEqual([client[0] + cx, client[1] + cy]);
    expect(totals()).toEqual({
      idle: {
        x: idle.x - (idle.x * pct) / ONE_8,
        y: idle.y - (idle.y * pct) / ONE_8,
      },
      owed: { x: owed.x + mx, y: owed.y + my },
      held: TICKS,
    });
    fullExit(v);
  });

  it.each([
    ['the manager paused', false, false, true],
    ['the pool paused', false, true, false],
    ['the pool sunset', true, false, false],
    ['everything paused', true, true, true],
  ] as const)('works with %s', (_, sunset, paused, manager) => {
    const v = setupVault();
    funded(v);
    if (manager) ok(vcall('pause-manager', [], v.client));
    setStatus(v, sunset, paused);
    // the manager cannot add: the vault refuses first, then the pool
    // (u1001 paused, u1002 sunset)
    expect(err(addLiquidity(v, 0n, AMOUNT, AMOUNT))).toBe(
      manager ? ERR.MANAGER_PAUSED : paused ? 1001n : 1002n,
    );
    ok(withdraw(v, 10_000_000n));
    ok(withdrawTicks(v, [0n], 50_000_000n));
    ok(withdrawTicks(v, [-1n, 1n], ONE_8));
    expect(totals().held).toEqual([0n]);
    // harvest also works in a paused pool, and while the manager is paused
    ok(harvest(v));
    fullExit(v);
  });

  it('withdraw-ticks takes listed, tracked bins in ascending order and leaves idle', () => {
    const v = setupVault();
    funded(v);
    expect(err(withdrawTicks(v, [1n, 0n]))).toBe(ERR.TICK_ORDER);
    expect(err(withdrawTicks(v, [0n, 0n]))).toBe(ERR.TICK_ORDER);
    expect(err(withdrawTicks(v, [0n, 5n]))).toBe(ERR.NOT_HELD);
    expect(err(withdrawTicks(v, [0n], 0n))).toBe(ERR.INVALID_PERCENT);
    const idle = totals().idle;
    const q0 = position(0n);
    const rs = withdrawTicks(v, [0n]);
    expect(ok(rs)).toMatchObject({ dx: q0['client-x'], dy: q0['client-y'] });
    expect(printed(rs).at(-1)).toMatchObject({ type: 'withdraw-ticks' });
    expect(totals().idle).toEqual(idle);
    expect(totals().held).toEqual([-1n, 1n]);
    expect(shares(v.pool, 0n, vaultAddress())).toBe(0n);
    fullExit(v);
  });

  it("honours the client's minimum amounts", () => {
    const v = setupVault();
    funded(v);
    const q = exitQuote();
    expect(err(withdraw(v, ONE_8, v.client, q.cx + 1n, 0n))).toBe(ERR.SLIPPAGE);
    expect(err(withdraw(v, ONE_8, v.client, 0n, q.cy + 1n))).toBe(ERR.SLIPPAGE);
    ok(withdraw(v, ONE_8, v.client, q.cx, q.cy));
  });
  it('still exits after governance moves the pool to another depositor', () => {
    const v = setupVault();
    funded(v);
    const rs = call(
      'clmm-pool-v1',
      'set-pool-depositor',
      [Cl.uint(v.pool.id), Cl.principal(v.trader)],
      deployer(),
    );
    expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
    // the pool refuses the vault's adds (u1006); its shares still leave
    expect(err(addLiquidity(v, 0n, AMOUNT, AMOUNT))).toBe(1006n);
    ok(withdraw(v, 50_000_000n));
    ok(harvest(v));
    fullExit(v);
  });
});

describe('zero burns', () => {
  it('a bin whose withdrawal burn rounds to zero is skipped, and burnt at 100%', () => {
    const v = setupVault();
    funded(v);
    // a dust bin: about 2e4 shares
    ok(addLiquidity(v, 5n, 100n, 0n));
    const dust = position(5n);
    expect(dust.shares).toBeGreaterThan(0n);
    expect(dust.shares).toBeLessThan(100_000n);
    const pct = 1_000n; // 0.001%: zero shares of the dust bin, some of the others
    const big = position(0n);
    ok(withdraw(v, pct));
    expect(position(5n)).toEqual(dust);
    expect(position(0n).shares).toBe(big.shares - (big.shares * pct) / ONE_8);
    ok(withdrawTicks(v, [0n, 5n], pct));
    expect(position(5n)).toEqual(dust);
    fullExit(v);
  });

  it('a harvest skips a bin whose manager share rounds to a zero percentage', () => {
    const v = setupVault();
    ok(deposit(v, 10n * AMOUNT, 10n * AMOUNT));
    ok(addLiquidity(v, 0n, AMOUNT, AMOUNT));
    ok(addLiquidity(v, 3n, AMOUNT, AMOUNT));
    // a tiny trade in bin 0: m > 0 but m * 1e8 / h < 1
    swapXForY(v.pool, 0n, 10n ** 7n, v.trader);
    // real growth in bin 3
    for (let i = 0; i < 3; i++) {
      swapXForY(v.pool, 3n, AMOUNT / 5n, v.trader);
      swapYForX(v.pool, 3n, AMOUNT / 5n, v.trader);
    }
    const b0 = position(0n);
    expect(b0['manager-shares']).toBeGreaterThan(0n);
    expect((b0['manager-shares'] * ONE_8) / b0.shares).toBe(0n);
    const b3 = position(3n);
    const rs = harvest(v);
    ok(rs);
    expect(position(0n)).toEqual(b0);
    const after = position(3n);
    expect(after.shares).toBeLessThan(b3.shares);
    expect([after.n, after.k]).toEqual([b3.n, b3.k]);
    expect(after.shares).toBeGreaterThanOrEqual(b3['client-shares']);
    expect(printed(rs).filter((e) => e.type === 'harvest-bin')).toHaveLength(1);
    // a phi change restarts both bins, burning only where it can, and
    // reports each one's new N and K
    const f = setManagerFee(v, 50_000_000n);
    const bins = printed(f).filter((e) => e.type === 'harvest-bin');
    expect(bins.map((e) => e.tick)).toEqual([0n, 3n]);
    for (const e of bins) {
      const p = position(e.tick as bigint);
      expect([e.n, e.k]).toEqual([p.n, p.k]);
    }
    expect(bins[0].shares).toBe(0n);
  });
});

describe('manager removals', () => {
  it('a removal moves the client part to idle and the manager part to owed', () => {
    const v = setupVault();
    funded(v);
    const p = position(0n);
    const idle = totals().idle;
    const rs = removeLiquidity(v, 0n, ONE_8);
    expect(ok(rs)).toMatchObject({
      dx: p['client-x'],
      dy: p['client-y'],
      'manager-x': p['manager-x'],
      'manager-y': p['manager-y'],
    });
    expect(totals()).toEqual({
      idle: { x: idle.x + p['client-x'], y: idle.y + p['client-y'] },
      owed: { x: p['manager-x'], y: p['manager-y'] },
      held: [-1n, 1n],
    });
    expect(shares(v.pool, 0n, vaultAddress())).toBe(0n);
    expect(err(removeLiquidity(v, 0n, ONE_8))).toBe(ERR.NOT_HELD);
    expect(err(removeLiquidity(v, 1n, 0n))).toBe(ERR.INVALID_PERCENT);
    expect(
      err(
        rebalance(
          v,
          [
            { tick: 1n, percent: ONE_8 },
            { tick: -1n, percent: ONE_8 },
          ],
          [],
        ),
      ),
    ).toBe(ERR.TICK_ORDER);
    // re-adding to the bin starts a new principal there
    ok(addLiquidity(v, 0n, AMOUNT, AMOUNT));
    expect(totals().held).toEqual([-1n, 1n, 0n]);
    fullExit(v);
  });

  it('rebalance removes, then adds from idle', () => {
    const v = setupVault();
    funded(v);
    const rs = rebalance(
      v,
      [
        { tick: -1n, percent: ONE_8 },
        { tick: 1n, percent: 50_000_000n },
      ],
      [
        { tick: 4n, maxX: AMOUNT, maxY: AMOUNT },
        { tick: 0n, maxX: AMOUNT, maxY: AMOUNT },
      ],
    );
    const r = ok(rs) as {
      removed: Record<string, bigint>;
      added: { tick: bigint }[];
    };
    expect(r.added.map((a) => a.tick)).toEqual([4n, 0n]);
    expect(totals().held).toEqual([0n, 1n, 4n]);
    expect(printed(rs).filter((e) => e.type === 'add-liquidity')).toHaveLength(
      2,
    );
    fullExit(v);
  });

  it('adds follow the bin ratio within budgets capped at idle', () => {
    const v = setupVault();
    ok(deposit(v, 10n * AMOUNT, 10n * AMOUNT));
    ok(addLiquidity(v, 0n, AMOUNT, 3n * AMOUNT));
    ok(addLiquidity(v, 1n, AMOUNT, 0n));
    // bin 0 holds X:Y = 1:3, so a budget of (1, 1) * AMOUNT takes AMOUNT/3 X
    const a = ok(addLiquidity(v, 0n, AMOUNT, AMOUNT)) as Record<string, bigint>;
    expect(a.dy).toBe(AMOUNT);
    expect(a.dx).toBe(AMOUNT / 3n);
    // bin 1 holds only X: an add takes no Y
    const b = ok(addLiquidity(v, 1n, AMOUNT, AMOUNT)) as Record<string, bigint>;
    expect([b.dx, b.dy]).toEqual([AMOUNT, 0n]);
    expect(err(addLiquidity(v, 1n, 0n, AMOUNT))).toBe(ERR.INVALID_AMOUNT);
    // budgets above idle take idle
    const idle = totals().idle;
    const c = ok(addLiquidity(v, 2n, 100n * AMOUNT, 0n)) as Record<
      string,
      bigint
    >;
    expect([c.dx, c.dy]).toEqual([idle.x, 0n]);
    expect(totals().idle.x).toBe(0n);
  });

  it('refuses an add whose deposit fee is not dust', () => {
    // at the 10% fee cap, an in-ratio add costs more than dust in a bin
    // whose price is far from 1 when the cheaper token binds: at tick 1000
    // one raw Y is worth about 21,000 raw X, so the Y the ratio rounds away
    // is worth up to that much X (tick -1000 is the mirror image; FEE-SHIFT
    // in the vault)
    const v = setupVault({ fee: MAX_FEE_RATE });
    ok(deposit(v, 10n * AMOUNT, 10n * AMOUNT));
    ok(addLiquidity(v, 1000n, AMOUNT, 1_000_003n));
    ok(addLiquidity(v, -1000n, 1_000_003n, AMOUNT));
    // here fee-x is 1,176 against a dust bound of 119
    expect(err(addLiquidity(v, 1000n, AMOUNT / 7n, AMOUNT / 2n))).toBe(
      ERR.DEPOSIT_FEE,
    );
    // fee-y 1,165 against 119
    expect(err(addLiquidity(v, -1000n, AMOUNT / 2n, AMOUNT / 7n))).toBe(
      ERR.DEPOSIT_FEE,
    );
    expect(totals().idle).toEqual({
      x: 9n * AMOUNT - 1_000_003n,
      y: 9n * AMOUNT - 1_000_003n,
    });
    // with the dearer token binding (the cheaper one's budget has a margin)
    // the same bins take the add, at a fee of at most 1 raw unit
    const fees = (rs: ReturnType<typeof addLiquidity>) =>
      printed(rs).find((e) => e.type === 'add-liquidity') as Record<
        string,
        bigint
      >;
    const up = fees(addLiquidity(v, 1000n, AMOUNT, 1_000n));
    expect(up.dy).toBe(1_000n);
    expect(up['fee-x'] + up['fee-y']).toBeLessThanOrEqual(1n);
    const down = fees(addLiquidity(v, -1000n, 1_000n, AMOUNT));
    expect(down.dx).toBe(1_000n);
    expect(down['fee-x'] + down['fee-y']).toBeLessThanOrEqual(1n);
    // near price 1 the cheaper token may bind at the cap
    ok(addLiquidity(v, 0n, AMOUNT, AMOUNT));
    const near = fees(addLiquidity(v, 0n, AMOUNT / 7n, AMOUNT));
    expect(near.dx).toBe(AMOUNT / 7n);
    expect(near['fee-x']).toBeLessThanOrEqual(2n);
  });

  it('tracks at most 64 bins', () => {
    const v = setupVault();
    ok(deposit(v, 100n * AMOUNT, 100n * AMOUNT));
    for (let t = 0n; t < 64n; t++) ok(addLiquidity(v, t, AMOUNT, AMOUNT));
    expect(totals().held).toHaveLength(64);
    expect(err(addLiquidity(v, 64n, AMOUNT, AMOUNT))).toBe(ERR.TOO_MANY_BINS);
    // a tracked bin still takes more
    ok(addLiquidity(v, 10n, AMOUNT, AMOUNT));
    ok(removeLiquidity(v, 10n, ONE_8));
    ok(addLiquidity(v, 64n, AMOUNT, AMOUNT));
    fullExit(v);
  });
});
