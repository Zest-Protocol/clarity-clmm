/**
 * clmm-vault-batch64-v1: clmm-vault-v1 with rebalance taking up to 64 removals
 * and 64 adds per call instead of 8 and 8. Every other path is the same code.
 * These tests cover the longer lists, that a failure anywhere reverts the
 * whole call, and that calls of 8 items or fewer behave exactly as
 * clmm-vault-v1's (a differential run on fresh sessions).
 */
import { readFileSync } from 'node:fs';
import { Cl, type ClarityValue } from '@stacks/transactions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plain } from '../lib/clarity';
import {
  balanceOf,
  bin,
  deployer,
  MAX_PRICE,
  ONE_8,
  ro,
  shares,
  swapXForY,
  swapYForX,
} from '../lib/protocol';
import {
  type AddSpec,
  config,
  deposit,
  ERR,
  err,
  harvest,
  ok,
  printed,
  rebalance,
  setupVault,
  totals,
  useVault,
  type Vault,
  vaultAddress,
  withdraw,
} from '../lib/vault';

const VAULT = 'clmm-vault-batch64-v1';
const LONG = 300_000;
const V1 = 'clmm-vault-v1';
const A = 10n ** 12n;
const range = (from: bigint, n: number) =>
  Array.from({ length: n }, (_, i) => from + BigInt(i));
const adds = (ticks: bigint[], amount = A): AddSpec[] =>
  ticks.map((tick) => ({ tick, maxX: amount, maxY: amount }));
const full = (ticks: bigint[]) =>
  ticks.map((tick) => ({ tick, percent: ONE_8 }));

/** The source without comments and with single spaces. */
const code = (name: string) =>
  readFileSync(`contracts/${name}.clar`, 'utf8')
    .replace(/;;[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const json = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? `${x}` : x));

/** Everything a call could have changed, for the ticks given. */
function snapshot(v: Vault, ticks: bigint[]) {
  const vault = vaultAddress();
  return json({
    totals: totals(),
    config: config(),
    positions: ticks.map((t) => plain(ro(VAULT, 'get-position', [Cl.int(t)]))),
    bins: ticks.map((t) => bin(v.pool, t)),
    lp: ticks.map((t) => shares(v.pool, t, vault)),
    vault: [balanceOf(v.pool.x, vault), balanceOf(v.pool.y, vault)],
    client: [balanceOf(v.pool.x, v.client), balanceOf(v.pool.y, v.client)],
  });
}

function earn(v: Vault, ticks: bigint[]) {
  for (const t of ticks) {
    ok(swapXForY(v.pool, t, 10n ** 9n, v.trader));
    ok(swapYForX(v.pool, t, 10n ** 9n, v.trader));
  }
}

/** A vault holding the given bins, each with both tokens and earned fees. */
function holding(ticks: bigint[]) {
  const v = setupVault({ supply: 10n ** 30n });
  ok(deposit(v, 400n * A, 400n * A));
  ok(rebalance(v, [], adds(ticks)));
  earn(v, ticks);
  return v;
}

const sorted = (xs: bigint[]) => [...xs].sort((a, b) => (a < b ? -1 : 1));

describe(VAULT, () => {
  beforeAll(() => useVault(VAULT));
  afterAll(() => useVault(V1));

  it('differs from clmm-vault-v1 only by the five list sizes', () => {
    const edits: [string, string][] = [
      [
        '(removes (list 8 { tick: int, percent: uint }))',
        '(removes (list 64 { tick: int, percent: uint }))',
      ],
      [
        '(adds (list 8 { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint }))',
        '(adds (list 64 { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint }))',
      ],
      [
        'results: (list 8 { tick: int, dx: uint, dy: uint, shares: uint })',
        'results: (list 64 { tick: int, dx: uint, dy: uint, shares: uint })',
      ],
      [
        '(append (get results a) r) u8) ERR-TOO-MANY-BINS)',
        '(append (get results a) r) u64) ERR-TOO-MANY-BINS)',
      ],
      [
        '(items (list 8 { tick: int, percent: uint })))',
        '(items (list 64 { tick: int, percent: uint })))',
      ],
    ];
    let v1 = code(V1);
    for (const [from, to] of edits) {
      expect(v1.split(from).length - 1, from).toBe(1);
      v1 = v1.replace(from, to);
    }
    expect(code(VAULT)).toBe(v1);
    expect(code(VAULT)).not.toMatch(/\(list 8 |\bu8\)/);
  });

  it(
    'takes 64 adds into new bins in one call',
    () => {
      const v = setupVault({ supply: 10n ** 30n });
      ok(deposit(v, 100n * A, 100n * A));
      const ticks = range(0n, 64);
      const rs = rebalance(v, [], adds(ticks));
      const out = ok(rs) as { added: { tick: bigint; shares: bigint }[] };
      expect(out.added.map((a) => a.tick)).toEqual(ticks);
      expect(out.added.every((a) => a.shares > 0n)).toBe(true);
      expect(sorted(totals().held)).toEqual(ticks);
      expect(
        printed(rs).filter((e) => e.type === 'add-liquidity'),
      ).toHaveLength(64);
      for (const t of ticks)
        expect(shares(v.pool, t, vaultAddress())).toBeGreaterThan(0n);
    },
    LONG,
  );

  it(
    'takes 64 full removes in one call, emptying every bin',
    () => {
      const ticks = range(0n, 64);
      const v = holding(ticks);
      const owed0 = totals().owed;
      const rs = rebalance(v, full(ticks), []);
      ok(rs);
      expect(totals().held).toEqual([]);
      for (const t of ticks) expect(shares(v.pool, t, vaultAddress())).toBe(0n);
      // fees were earned in every bin, so the manager's 20% went to owed
      expect(totals().owed.x).toBeGreaterThan(owed0.x);
      expect(totals().owed.y).toBeGreaterThan(owed0.y);
      expect(printed(rs).filter((e) => e.type === 'remove-bin')).toHaveLength(
        64,
      );
    },
    LONG,
  );

  it(
    'takes 64 full removes and 64 adds into new bins together',
    () => {
      const old = range(0n, 64);
      const fresh = range(100n, 64);
      const v = holding(old);
      const rs = rebalance(v, full(old), adds(fresh));
      const out = ok(rs) as { added: { tick: bigint }[] };
      expect(out.added).toHaveLength(64);
      expect(sorted(totals().held)).toEqual(fresh);
      for (const t of old) expect(shares(v.pool, t, vaultAddress())).toBe(0n);
      for (const t of fresh)
        expect(shares(v.pool, t, vaultAddress())).toBeGreaterThan(0n);
    },
    LONG,
  );

  it(
    'refuses a 65th distinct bin with ERR-TOO-MANY-BINS and reverts the whole call',
    () => {
      // 64 held: a removal that leaves its bin held frees no slot
      const ticks = range(0n, 64);
      const v = holding(ticks);
      const watched = [...ticks, 100n];
      const before = snapshot(v, watched);
      expect(
        err(rebalance(v, [{ tick: 0n, percent: ONE_8 / 2n }], adds([100n]))),
      ).toBe(ERR.TOO_MANY_BINS);
      expect(snapshot(v, watched)).toBe(before);
    },
    LONG,
  );

  it(
    'refuses a 65th bin reached within one call and places none of its adds',
    () => {
      const ticks = range(0n, 60);
      const v = holding(ticks);
      const fresh = range(100n, 5);
      const watched = [...ticks, ...fresh];
      const before = snapshot(v, watched);
      expect(err(rebalance(v, [], adds(fresh)))).toBe(ERR.TOO_MANY_BINS);
      expect(snapshot(v, watched)).toBe(before);
    },
    LONG,
  );

  it(
    'reverts everything, removes included, when one add in the middle of 64 fails',
    () => {
      const old = range(0n, 64);
      const fresh = range(100n, 64);
      const v = holding(old);
      const watched = [...old, ...fresh];
      const before = snapshot(v, watched);
      // a vault check: nothing to add
      const empty = adds(fresh);
      empty[32] = { tick: fresh[32], maxX: 0n, maxY: 0n };
      expect(err(rebalance(v, full(old), empty))).toBe(ERR.INVALID_AMOUNT);
      expect(snapshot(v, watched)).toBe(before);
      // a pool check: the bin's price below min-price
      const priced = adds(fresh);
      priced[32] = { tick: fresh[32], maxX: A, maxY: A, minPrice: MAX_PRICE };
      expect(rebalance(v, full(old), priced).result.type).toBe('err');
      expect(snapshot(v, watched)).toBe(before);
    },
    LONG,
  );

  it(
    'refuses out-of-order or duplicate ticks in 64 removes with ERR-TICK-ORDER',
    () => {
      const ticks = range(0n, 64);
      const v = holding(ticks);
      const before = snapshot(v, ticks);
      const swapped = [...ticks];
      [swapped[40], swapped[41]] = [swapped[41], swapped[40]];
      expect(err(rebalance(v, full(swapped), []))).toBe(ERR.TICK_ORDER);
      const duplicated = [...ticks.slice(0, 21), 20n, ...ticks.slice(21, 63)];
      expect(duplicated).toHaveLength(64);
      expect(err(rebalance(v, full(duplicated), []))).toBe(ERR.TICK_ORDER);
      expect(snapshot(v, ticks)).toBe(before);
    },
    LONG,
  );

  it(
    'pays a harvest and a full client withdraw with 64 bins held',
    () => {
      const ticks = range(0n, 64);
      const v = holding(ticks);
      const fees0 =
        balanceOf(v.pool.x, v.recipient) + balanceOf(v.pool.y, v.recipient);
      ok(harvest(v));
      expect(
        balanceOf(v.pool.x, v.recipient) + balanceOf(v.pool.y, v.recipient),
      ).toBeGreaterThan(fees0);
      earn(v, ticks);
      const client0 =
        balanceOf(v.pool.x, v.client) + balanceOf(v.pool.y, v.client);
      ok(withdraw(v, ONE_8));
      const after = totals();
      expect(after.held).toEqual([]);
      expect(after.idle).toEqual({ x: 0n, y: 0n });
      expect(
        balanceOf(v.pool.x, v.client) + balanceOf(v.pool.y, v.client),
      ).toBeGreaterThan(client0);
      for (const t of ticks) expect(shares(v.pool, t, vaultAddress())).toBe(0n);
      // the exit kept the manager's part of the fees since the harvest as owed
      expect(after.owed.x + after.owed.y).toBeGreaterThan(0n);
      ok(harvest(v));
      expect(totals().owed).toEqual({ x: 0n, y: 0n });
    },
    LONG,
  );
});

// The same seeded sequence on each vault, each on a fresh session, so pool ids
// and block heights match: every result, event and state read must be equal
// once the vault's name is swapped.
describe(`${VAULT} against clmm-vault-v1, calls of 8 items or fewer`, () => {
  const SEED = 0x64b47c1;
  const STEPS = 120;
  let reference: string[] = [];

  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const event = (e: { event: string; data: Record<string, unknown> }) => {
    if (e.event === 'print_event')
      return `print ${Cl.prettyPrint(e.data.value as ClarityValue)}`;
    const { raw_value: _, ...rest } = e.data as Record<string, unknown>;
    return `${e.event} ${json(rest)}`;
  };

  function run(vault: string): string[] {
    useVault(vault);
    const v = setupVault({ supply: 10n ** 30n });
    const rand = rng(SEED);
    const int = (n: number) => Math.floor(rand() * n);
    const out: string[] = [];
    const rec = (
      label: string,
      rs: { result: ClarityValue; events: unknown[] },
    ) =>
      out.push(
        json({
          label,
          result: Cl.prettyPrint(rs.result),
          events: (rs.events as Parameters<typeof event>[0][]).map(event),
        }),
      );
    const state = () => {
      const held = totals().held;
      out.push(
        json({
          totals: totals(),
          config: config(),
          positions: range(-12n, 25).map((t) =>
            plain(ro(vault, 'get-position', [Cl.int(t)])),
          ),
          vault: [
            balanceOf(v.pool.x, vaultAddress()),
            balanceOf(v.pool.y, vaultAddress()),
          ],
          held,
        }),
      );
    };
    rec('deposit', deposit(v, 10n ** 15n, 10n ** 15n));
    for (let step = 0; step < STEPS; step++) {
      const held = sorted(totals().held);
      const r = rand();
      if (r < 0.6) {
        const pool = [...held];
        const removes: { tick: bigint; percent: bigint }[] = [];
        for (let i = int(9); i > 0 && pool.length; i--) {
          const [tick] = pool.splice(int(pool.length), 1);
          const pct = [ONE_8, ONE_8 / 2n, BigInt(1 + int(Number(ONE_8)))][
            int(3)
          ];
          removes.push({ tick, percent: pct });
        }
        removes.sort((a, b) => (a.tick < b.tick ? -1 : 1));
        const fault = rand();
        if (fault < 0.06 && removes.length > 1) removes.reverse();
        else if (fault < 0.1 && removes.length)
          removes.push({ ...removes[removes.length - 1] });
        else if (fault < 0.14) removes.push({ tick: 50n, percent: ONE_8 });
        const add: AddSpec[] = [];
        for (let i = int(9); i > 0; i--) {
          const amount = () => [0n, 10n ** 9n, 10n ** 11n, 10n ** 12n][int(4)];
          add.push({
            tick: BigInt(int(25) - 12),
            maxX: amount(),
            maxY: amount(),
          });
        }
        rec(
          `rebalance ${removes.length} + ${add.length}`,
          rebalance(v, removes, add),
        );
        state();
      } else if (r < 0.9 && held.length) {
        const t = held[int(held.length)];
        const size = BigInt(1 + int(1000)) * 10n ** 9n;
        rec('swap x', swapXForY(v.pool, t, size, v.trader));
        rec('swap y', swapYForX(v.pool, t, size, v.trader));
      } else {
        rec('harvest', harvest(v));
        state();
      }
    }
    // a capped call and each refusal, whatever the random walk produced
    const held = sorted(totals().held);
    rec(
      'rebalance 8 + 8',
      rebalance(v, full(held.slice(0, 8)), adds(range(-12n, 8), 10n ** 11n)),
    );
    state();
    const now = sorted(totals().held);
    rec('out of order', rebalance(v, full([...now.slice(0, 2)].reverse()), []));
    rec('not held', rebalance(v, full([99n]), []));
    rec('zero add', rebalance(v, [], [{ tick: 0n, maxX: 0n, maxY: 0n }]));
    state();
    return out;
  }

  it(
    'records the sequence on clmm-vault-v1',
    () => {
      reference = run(V1);
      useVault(VAULT);
      const text = reference.join('\n');
      expect(text).toContain('"label":"rebalance 8 + 8"');
      for (const code of [ERR.TICK_ORDER, ERR.NOT_HELD, ERR.INVALID_AMOUNT])
        expect(text).toContain(`(err u${code})`);
      expect(
        reference.filter((l) => l.includes('"result":"(ok')).length,
      ).toBeGreaterThan(STEPS / 2);
    },
    LONG,
  );

  it(
    'gives the same results, events and state on clmm-vault-batch64-v1',
    () => {
      expect(reference.length).toBeGreaterThan(0);
      const from = `${deployer()}.${VAULT}`;
      const to = `${deployer()}.${V1}`;
      const got = run(VAULT).map((l) => l.replaceAll(from, to));
      useVault(VAULT);
      expect(got).toHaveLength(reference.length);
      for (let i = 0; i < got.length; i++)
        expect(got[i], `line ${i}`).toBe(reference[i]);
    },
    LONG,
  );
});
