/**
 * clmm-vault-public-v1: clmm-vault-v1 without its depositor check, on a public
 * pool with outside LPs in the vault's bins. The fee cut, exits and every other
 * path are the same code; these tests cover what a public pool adds.
 */
import { readFileSync } from 'node:fs';
import { Cl } from '@stacks/transactions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  account,
  balanceOf,
  call,
  mint,
  ONE_8,
  addLiquidity as poolAdd,
  reducePositions,
  swapXForY,
  swapYForX,
  tokenId,
} from '../lib/protocol';
import {
  addLiquidity,
  config,
  deposit,
  harvest,
  ok,
  position,
  setupVault,
  totals,
  useVault,
  type Vault,
  vaultAddress,
  withdraw,
} from '../lib/vault';

const VAULT = 'clmm-vault-public-v1';
const X = 'mock-token-a';
const Y = 'mock-token-b';
const T = 0n;
const A = 10n ** 12n;
const SUPPLY = 10n ** 30n;

const fund = (who: string) => {
  mint(X, SUPPLY, who);
  mint(Y, SUPPLY, who);
};
const held = (who: string) => balanceOf(X, who) + balanceOf(Y, who);
const churn = (v: Vault, n: number, size: bigint, who = v.trader) => {
  for (let i = 0; i < n; i++) {
    swapXForY(v.pool, T, size, who);
    swapYForX(v.pool, T, size, who);
  }
};
const setup = (fee: bigint, rebate: bigint, phi: bigint) =>
  setupVault({ fee, rebate, phi, supply: SUPPLY, publicPool: true });
const abs = (a: bigint) => (a < 0n ? -a : a);

/** The source without comments and with single spaces. */
const code = (name: string) =>
  readFileSync(`contracts/${name}.clar`, 'utf8')
    .replace(/;;[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

describe(VAULT, () => {
  beforeAll(() => useVault(VAULT));
  afterAll(() => useVault('clmm-vault-v1'));

  it('differs from clmm-vault-v1 only by the depositor check', () => {
    const check =
      '(asserts! (is-eq (get depositor pool) (some current-contract)) ERR-NOT-DEPOSITOR) ';
    const v1 = code('clmm-vault-v1');
    expect(v1).toContain(check);
    expect(code(VAULT)).toBe(v1.replace(check, ''));
  });

  it('LPs fairly beside an equal outside LP, and everyone exits', () => {
    const v = setup(1_000_000n, 80_000_000n, 20_000_000n);
    const outside = account('wallet_5');
    fund(outside);
    expect(poolAdd(v.pool, T, A, A, outside).result.type).toBe('ok');
    ok(deposit(v, A, A));
    ok(addLiquidity(v, T, A, A));
    churn(v, 20, 10n ** 10n);
    const [client0, fees0, outside0] = [
      held(v.client),
      held(v.recipient),
      held(outside),
    ];
    ok(withdraw(v, ONE_8));
    ok(harvest(v));
    expect(
      reducePositions(v.pool, [{ tick: T, percent: ONE_8 }], outside).result
        .type,
    ).toBe('ok');
    const client = held(v.client) - client0;
    const fees = held(v.recipient) - fees0;
    const outsider = held(outside) - outside0;
    expect(client).toBeGreaterThan(2n * A);
    // the first deposit's 1,000 locked shares fall on the outside LP
    expect(abs(client + fees - outsider)).toBeLessThan(10_000n);
    // the manager takes phi of the vault's growth; the bin's moved price
    // keeps it within 0.1% of phi in token terms
    const growth = client + fees - 2n * A;
    expect(abs(fees - growth / 5n) * 1_000n).toBeLessThan(growth);
    expect(totals().held).toEqual([]);
  });

  it('keeps the split when an outside LP arrives and leaves', () => {
    const v = setup(1_000_000n, 80_000_000n, 20_000_000n);
    const outside = account('wallet_5');
    fund(outside);
    ok(deposit(v, A, A));
    ok(addLiquidity(v, T, A, A));
    churn(v, 20, 10n ** 10n);
    const value = () => {
      const p = position(T);
      return {
        client: p['client-x'] + p['client-y'],
        manager: p['manager-x'] + p['manager-y'],
      };
    };
    const before = value();
    expect(poolAdd(v.pool, T, 50n * A, 50n * A, outside).result.type).toBe(
      'ok',
    );
    expect(
      reducePositions(v.pool, [{ tick: T, percent: ONE_8 }], outside).result
        .type,
    ).toBe('ok');
    const after = value();
    expect(after.client).toBeGreaterThanOrEqual(before.client);
    expect(after.manager).toBeGreaterThanOrEqual(before.manager);
  });

  it.each([
    [2_000n, 10n ** 6n],
    [2_000n, 10n ** 9n],
    [10n ** 5n, 10n ** 7n],
    [2_000n, 10n ** 12n],
  ])(
    'survives a bin seeded and inflated first: seed %s, add %s',
    (seed, add) => {
      const v = setup(10_000_000n, ONE_8, 0n);
      const attacker = account('wallet_5');
      fund(attacker);
      expect(poolAdd(v.pool, T, seed, seed, attacker).result.type).toBe('ok');
      churn(v, 40, seed, attacker);
      ok(deposit(v, add, add));
      ok(addLiquidity(v, T, add, add));
      const p = position(T);
      const { idle } = totals();
      const value = p['client-x'] + p['client-y'] + idle.x + idle.y;
      expect(2n * add - value).toBeLessThan(10n);
    },
  );

  it('adds into bins other LPs shaped', () => {
    const v = setup(3_000_000n, 80_000_000n, 20_000_000n);
    const other = account('wallet_5');
    fund(other);
    ok(deposit(v, 10n ** 9n, 10n ** 9n));
    // a lopsided bin, where the add's other side rounds to zero
    expect(
      poolAdd(v.pool, 1_200n, 10n ** 16n, 72_462_192_850n, other).result.type,
    ).toBe('ok');
    ok(addLiquidity(v, 1_200n, 100_000n, 0n));
    // a bin holding one token: the add takes only that token
    expect(poolAdd(v.pool, 5n, 10n ** 12n, 0n, other).result.type).toBe('ok');
    expect(ok(addLiquidity(v, 5n, 10n ** 8n, 10n ** 8n))).toMatchObject({
      dx: 10n ** 8n,
      dy: 0n,
    });
  });

  it('exits past huge outside liquidity and gifted shares', () => {
    const v = setup(1_000_000n, 80_000_000n, 20_000_000n);
    const other = account('wallet_5');
    fund(other);
    const ticks = [0n, 1n, 2n, 3n];
    ok(deposit(v, 4n * A, 4n * A));
    for (const t of ticks) ok(addLiquidity(v, t, t === 0n ? A : 0n, A));
    for (const t of ticks) {
      const dx = t === 0n ? 10n ** 24n : 0n;
      expect(poolAdd(v.pool, t, dx, 10n ** 24n, other).result.type).toBe('ok');
    }
    churn(v, 5, 10n ** 12n);
    expect(
      call(
        'clmm-lp-token-v1',
        'transfer',
        [
          Cl.uint(tokenId(v.pool, 1n)),
          Cl.uint(10n ** 9n),
          Cl.principal(other),
          Cl.principal(vaultAddress()),
        ],
        other,
      ).result.type,
    ).toBe('ok');
    const client0 = held(v.client);
    ok(harvest(v));
    ok(withdraw(v, ONE_8));
    expect(totals().held).toEqual([]);
    expect(held(v.client) - client0).toBeGreaterThanOrEqual(8n * A - 1_000n);
  });

  it('runs on native STX', () => {
    const v = setupVault({
      x: 'mock-token-stx',
      y: X,
      fee: 3_000_000n,
      rebate: 80_000_000n,
      phi: 20_000_000n,
      supply: SUPPLY,
      publicPool: true,
    });
    expect(config()['native-x']).toBe(true);
    const outside = account('wallet_5');
    mint(X, SUPPLY, outside);
    const amount = 10n ** 10n;
    expect(poolAdd(v.pool, T, amount, amount, outside).result.type).toBe('ok');
    ok(deposit(v, amount, amount));
    ok(addLiquidity(v, T, amount, amount));
    churn(v, 5, 10n ** 8n);
    // a withdrawal keeps the manager's part as owed, for the harvest after it
    ok(withdraw(v, ONE_8));
    ok(harvest(v));
    expect(totals().held).toEqual([]);
    expect(balanceOf('mock-token-stx', vaultAddress())).toBe(0n);
    expect(balanceOf(X, vaultAddress())).toBe(0n);
  });
});
