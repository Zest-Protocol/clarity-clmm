/**
 * The vault against hostile tokens and unsolicited transfers: a fee
 * recipient that cannot receive blocks only harvests; payouts run under
 * allowances equal to the amount and burns under none, so a token cannot
 * take more of a token or another token, and a token cannot take the
 * vault's LP shares (they move only for their owner calling the LP token or
 * the pool itself); tokens and LP shares sent to the vault are not counted;
 * and a native-STX wrapper pool works end to end.
 */
import type { ParsedTransactionResult } from '@stacks/clarinet-sdk';
import { Cl } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import { okUint } from '../lib/clarity';
import {
  account,
  balanceOf,
  bootstrap,
  call,
  contract,
  createPool,
  deployer,
  mint,
  ONE_8,
  addLiquidity as poolAdd,
  removeLiquidity as poolRemove,
  ro,
  shares,
  swapXForY,
  swapYForX,
  token,
  tokenId,
} from '../lib/protocol';
import {
  addLiquidity,
  config,
  deposit,
  err,
  harvest,
  ok,
  position,
  printed,
  setManagerFee,
  setupVault,
  totals,
  type Vault,
  vaultAddress,
  vcall,
  withdraw,
  withdrawTicks,
} from '../lib/vault';

const AMOUNT = 10n ** 12n;
const TICKS = [-1n, 0n, 1n];

function funded(v: Vault, amount = AMOUNT) {
  ok(deposit(v, 10n * amount, 10n * amount));
  ok(addLiquidity(v, -1n, 0n, amount));
  ok(addLiquidity(v, 0n, amount, amount));
  ok(addLiquidity(v, 1n, amount, 0n));
  for (let r = 0; r < 3; r++)
    for (const t of TICKS) {
      swapXForY(v.pool, t, amount / 7n, v.trader);
      swapYForX(v.pool, t, amount / 5n, v.trader);
    }
}

function evilMode(mode: bigint, target?: string) {
  ok(call('mock-token-evil', 'set-mode', [Cl.uint(mode)], deployer()));
  if (target)
    ok(
      call('mock-token-evil', 'set-target', [Cl.principal(target)], deployer()),
    );
}

// the LP token's errors for the thief's refused moves
const refused = (rs: ParsedTransactionResult) =>
  printed(rs)
    .filter((p) => p.type === 'lp-thief-refused')
    .map((p) => p.code as bigint);

function send(name: string, amount: bigint, from: string, to: string) {
  ok(
    call(
      name,
      'transfer',
      [Cl.uint(amount), Cl.principal(from), Cl.principal(to), Cl.none()],
      from,
    ),
  );
}

function sendShares(id: bigint, amount: bigint, from: string, to: string) {
  ok(
    call(
      'clmm-lp-token-v1',
      'transfer',
      [Cl.uint(id), Cl.uint(amount), Cl.principal(from), Cl.principal(to)],
      from,
    ),
  );
}

const lpTotal = (who: string) =>
  okUint(ro('clmm-lp-token-v1', 'get-overall-balance', [Cl.principal(who)]));

describe('a fee recipient that cannot receive', () => {
  it('blocks harvests only; every exit still works', () => {
    const v = setupVault({ x: 'mock-token-evil' });
    funded(v);
    evilMode(6n, v.recipient);
    expect(err(harvest(v))).toBe(1001n);
    expect(err(setManagerFee(v, 0n))).toBe(1001n);
    ok(withdraw(v, 20_000_000n));
    ok(withdrawTicks(v, [-1n], ONE_8));
    ok(withdraw(v));
    expect(totals().held).toEqual([]);
    const owed = totals().owed;
    expect(owed.x).toBeGreaterThan(0n);
    // governance points the cut elsewhere, and the harvest pays it
    const other = vcall(
      'set-fee-recipient',
      [Cl.principal(v.trader)],
      deployer(),
    );
    ok(other);
    const before = balanceOf('mock-token-evil', v.trader);
    expect(ok(harvest(v))).toMatchObject({ dx: owed.x, dy: owed.y });
    expect(balanceOf('mock-token-evil', v.trader)).toBe(before + owed.x);
  });
});

describe('exact allowances', () => {
  it('a payout cannot move more of the token than the payout, nor another token', () => {
    const v = setupVault({ x: 'mock-token-evil' });
    ok(deposit(v, AMOUNT, AMOUNT));
    // someone sends the vault ten times its idle, and some token A
    mint('mock-token-evil', 10n * AMOUNT, v.trader);
    mint('mock-token-a', AMOUNT, v.trader);
    send('mock-token-evil', 10n * AMOUNT, v.trader, vaultAddress());
    send('mock-token-a', AMOUNT, v.trader, vaultAddress());
    const vault = () => [
      balanceOf('mock-token-evil', vaultAddress()),
      balanceOf('mock-token-a', vaultAddress()),
      balanceOf('mock-token-b', vaultAddress()),
    ];
    const held = vault();
    // mode 1 moves twice the amount, mode 2 also moves token A
    for (const mode of [1n, 2n]) {
      evilMode(mode);
      expect(withdraw(v).result.type, `mode ${mode}`).toBe(
        Cl.error(Cl.uint(0)).type,
      );
      expect(vault()).toEqual(held);
      expect(totals().idle).toEqual({ x: AMOUNT, y: AMOUNT });
    }
    evilMode(0n);
    ok(withdraw(v));
    expect(vault()).toEqual([10n * AMOUNT, AMOUNT, 0n]);
  });

  it('a pull checks what arrived and what else moved', () => {
    const v = setupVault({ x: 'mock-token-evil' });
    for (const mode of [1n, 2n, 3n]) {
      evilMode(mode);
      const rs = deposit(v, AMOUNT, AMOUNT);
      expect(rs.result.type, `mode ${mode}`).toBe(Cl.error(Cl.uint(0)).type);
      if (mode === 3n) expect(err(rs)).toBe(6018n);
    }
    expect(totals().idle).toEqual({ x: 0n, y: 0n });
    expect(balanceOf('mock-token-evil', vaultAddress())).toBe(0n);
  });

  it('a token that under-delivers to the client does not lock its exit', () => {
    const v = setupVault({ x: 'mock-token-evil' });
    funded(v);
    evilMode(4n, v.client);
    const before = balanceOf('mock-token-evil', v.client);
    const r = ok(withdraw(v)) as Record<string, bigint>;
    // the vault paid r.dx; the token delivered half
    expect(balanceOf('mock-token-evil', v.client)).toBe(before + r.dx / 2n);
    expect(totals().idle).toEqual({ x: 0n, y: 0n });
  });

  // LP shares move only for their owner calling the LP token or the pool
  // itself, so every attempt of the token is refused (u4) and the vault's
  // calls go through. In its balance checks the token runs as the vault only
  // in the adds, whose pull reads the pool's balance before and after with
  // the vault as tx-sender (the pool's payouts read balances as the pool);
  // in its transfers it runs as the vault in every call, as the pool pulls
  // from the vault or the vault pays the client or the fee recipient.
  it.each([
    ['in its balance checks', 1n, [[4n, 4n], [4n, 4n], [], [], [], []]],
    ['in its transfers', 2n, [[4n], [4n], [4n], [4n], [4n], [4n]]],
  ] as const)(
    "a token cannot take the vault's LP shares %s",
    (_, where, codes) => {
      const v = setupVault({ x: 'mock-token-lp-thief' });
      mint('mock-token-lp-thief', 10n ** 24n, v.client);
      mint('mock-token-lp-thief', 10n ** 24n, v.trader);
      mint('mock-token-a', 10n ** 24n, v.trader);
      // the vault also holds shares of a public pool, sent by someone
      const pub = createPool('mock-token-a', 'mock-token-b', 100n);
      ok(poolAdd(pub, 0n, AMOUNT, AMOUNT, v.trader));
      const other = tokenId(pub, 0n);
      sendShares(other, 10n ** 6n, v.trader, vaultAddress());
      funded(v);
      ok(
        call(
          'mock-token-lp-thief',
          'arm',
          [
            Cl.uint(other),
            Cl.uint(1),
            Cl.principal(vaultAddress()),
            Cl.uint(where),
          ],
          deployer(),
        ),
      );
      const results = [
        addLiquidity(v, 0n, AMOUNT, AMOUNT),
        addLiquidity(v, 5n, AMOUNT, AMOUNT),
        withdraw(v, 10_000_000n),
        withdrawTicks(v, [0n]),
        harvest(v),
        withdraw(v),
      ].map((rs) => {
        ok(rs);
        return refused(rs);
      });
      expect(results).toEqual(codes);
      expect(shares(pub, 0n, vaultAddress())).toBe(10n ** 6n);
      expect(shares(pub, 0n, deployer())).toBe(0n);
      expect(totals().held).toEqual([]);
      expect(lpTotal(vaultAddress())).toBe(10n ** 6n);
    },
  );

  it('(nor the shares of a caller without allowances)', () => {
    bootstrap();
    const trader = account('wallet_6');
    mint('mock-token-lp-thief', 10n ** 24n, trader);
    mint('mock-token-a', 10n ** 24n, trader);
    mint('mock-token-b', 10n ** 24n, trader);
    const pub = createPool('mock-token-a', 'mock-token-b', 100n);
    ok(poolAdd(pub, 0n, AMOUNT, AMOUNT, trader));
    const bad = createPool('mock-token-lp-thief', 'mock-token-b', 100n);
    ok(poolAdd(bad, 0n, AMOUNT, AMOUNT, trader));
    const before = shares(pub, 0n, trader);
    ok(
      call(
        'mock-token-lp-thief',
        'arm',
        [
          Cl.uint(tokenId(pub, 0n)),
          Cl.uint(1),
          Cl.principal(trader),
          Cl.uint(3),
        ],
        deployer(),
      ),
    );
    // the pool's pull runs the token as the trader (its balance reads and
    // the transfer); its payout runs it as the pool
    const add = poolAdd(bad, 0n, AMOUNT, AMOUNT, trader);
    ok(add);
    expect(refused(add)).toEqual([4n, 4n, 4n]);
    ok(poolRemove(bad, 0n, ONE_8, trader));
    expect(shares(pub, 0n, trader)).toBe(before);
    expect(shares(pub, 0n, deployer())).toBe(0n);
  });
});

describe('unsolicited transfers', () => {
  it('tokens sent to the vault are not counted', () => {
    const v = setupVault();
    funded(v);
    send('mock-token-a', 7n * AMOUNT, v.trader, vaultAddress());
    send('mock-token-b', 3n * AMOUNT, v.trader, vaultAddress());
    const idle = totals().idle;
    ok(withdraw(v));
    ok(harvest(v));
    expect(totals()).toEqual({
      idle: { x: 0n, y: 0n },
      owed: { x: 0n, y: 0n },
      held: [],
    });
    expect(idle.x).toBeGreaterThan(0n);
    // idle and owed are gone; the vault keeps exactly the gift
    expect(balanceOf('mock-token-a', vaultAddress())).toBe(7n * AMOUNT);
    expect(balanceOf('mock-token-b', vaultAddress())).toBe(3n * AMOUNT);
  });

  it("LP shares sent for an untracked bin are ignored; for a tracked bin they are the manager's", () => {
    const v = setupVault();
    funded(v);
    const donor = v.trader;
    const setDepositor = (who: string) =>
      ok(
        call(
          'clmm-pool-v1',
          'set-pool-depositor',
          [Cl.uint(v.pool.id), Cl.principal(who)],
          deployer(),
        ),
      );
    // a former depositor's shares in bins 0 (tracked) and 7 (not)
    setDepositor(donor);
    ok(poolAdd(v.pool, 7n, AMOUNT, AMOUNT, donor));
    ok(poolAdd(v.pool, 0n, AMOUNT, AMOUNT, donor));
    setDepositor(vaultAddress());
    // and shares of another pool
    const pub = createPool('mock-token-a', 'mock-token-b', 100n);
    ok(poolAdd(pub, 0n, AMOUNT, AMOUNT, donor));
    const b0 = position(0n);
    const gift = shares(v.pool, 0n, donor);
    sendShares(tokenId(v.pool, 0n), gift, donor, vaultAddress());
    sendShares(
      tokenId(v.pool, 7n),
      shares(v.pool, 7n, donor),
      donor,
      vaultAddress(),
    );
    sendShares(tokenId(pub, 0n), 10n ** 6n, donor, vaultAddress());
    const after = position(0n);
    expect(after.shares).toBe(b0.shares + gift);
    expect(after['client-shares']).toBe(b0['client-shares']);
    expect(after['manager-shares']).toBe(b0['manager-shares'] + gift);
    expect([after.n, after.k]).toEqual([b0.n, b0.k]);
    expect(totals().held).toEqual(TICKS);
    const seven = shares(v.pool, 7n, vaultAddress());
    ok(withdraw(v));
    for (const t of TICKS) expect(shares(v.pool, t, vaultAddress())).toBe(0n);
    expect(shares(v.pool, 7n, vaultAddress())).toBe(seven);
    expect(shares(pub, 0n, vaultAddress())).toBe(10n ** 6n);
    expect(lpTotal(vaultAddress())).toBe(seven + 10n ** 6n);
  });
});

describe('native STX', () => {
  it('a pool of the STX wrapper works end to end', () => {
    const v = setupVault({
      x: 'mock-token-stx',
      y: 'mock-token-a',
      supply: 10n ** 24n,
    });
    expect(config()['native-x']).toBe(true);
    const stx = (who: string) => balanceOf('mock-token-stx', who);
    const client = stx(v.client);
    const amount = 10n ** 10n;
    funded(v, amount);
    ok(withdraw(v, 30_000_000n));
    ok(harvest(v));
    ok(withdraw(v));
    ok(harvest(v));
    expect(totals()).toEqual({
      idle: { x: 0n, y: 0n },
      owed: { x: 0n, y: 0n },
      held: [],
    });
    expect(stx(vaultAddress())).toBe(0n);
    expect(balanceOf('mock-token-a', vaultAddress())).toBe(0n);
    expect(stx(v.recipient)).toBeGreaterThan(0n);
    // the client got back what it put in, give or take the trades
    expect(stx(v.client)).toBeGreaterThan(client - 10n * amount);
    expect(contract('mock-token-stx')).toBe(config()['token-x']);
    expect(token('mock-token-stx')).toBeTruthy();
  });
});
