/**
 * The vault's fee cut against precomputed vectors: tests/vectors/vault-fee.json
 * runs one script of
 * deposits, in-ratio adds, swaps, harvests, removals, a phi change and
 * withdrawals over six bins. Replayed here, every bin's N, K, the vault's
 * shares and their client/manager split, idle, owed, the tracked ticks and
 * every token paid to the client and the fee recipient must equal the
 * vectors' after every operation.
 */
import { readFileSync } from 'node:fs';
import { Cl } from '@stacks/transactions';
import { expect, it } from 'vitest';
import { balanceOf, bin, ONE_8, swapXForY, swapYForX } from '../lib/protocol';
import {
  addLiquidity,
  deposit,
  harvest,
  ok,
  position,
  printed,
  rebalance,
  setManagerFee,
  setupVault,
  totals,
  withdraw,
  withdrawTicks,
} from '../lib/vault';

type Pair = [string, string];
interface BinState {
  n: string;
  k: string;
  shares: string;
  'client-shares': string;
  'manager-shares': string;
  'balance-x': string;
  'balance-y': string;
  supply: string;
}
interface State {
  bins: Record<string, BinState>;
  held: string[];
  idle: Pair;
  owed: Pair;
  client: Pair;
  recipient: Pair;
}
interface Op {
  op: string;
  [k: string]: unknown;
  expect: State & { 'balance-x'?: string; 'balance-y'?: string };
  result?: Record<string, string>;
}

const vectors = JSON.parse(
  readFileSync(new URL('../vectors/vault-fee.json', import.meta.url), 'utf8'),
) as { params: Record<string, string>; ops: Op[] };

const big = (v: unknown) => BigInt(v as string);

it('matches the vectors on the same operations', () => {
  const p = vectors.params;
  const v = setupVault({
    binStep: big(p['bin-step']),
    fee: big(p.fee),
    rebate: big(p.rebate),
    phi: big(p.phi),
    supply: 10n ** 24n,
  });
  const start = {
    client: [
      balanceOf('mock-token-a', v.client),
      balanceOf('mock-token-b', v.client),
    ],
    recipient: [
      balanceOf('mock-token-a', v.recipient),
      balanceOf('mock-token-b', v.recipient),
    ],
  };
  let deposited: Pair | bigint[] = [0n, 0n];
  let checked = 0;
  for (const [i, op] of vectors.ops.entries()) {
    const at = `op ${i} (${op.op})`;
    switch (op.op) {
      case 'deposit': {
        ok(deposit(v, big(op.dx), big(op.dy)));
        deposited = [
          (deposited[0] as bigint) + big(op.dx),
          (deposited[1] as bigint) + big(op.dy),
        ];
        break;
      }
      case 'add': {
        const rs = addLiquidity(
          v,
          big(op.tick),
          big(op['max-x']),
          big(op['max-y']),
        );
        const r = op.result as Record<string, string>;
        expect(ok(rs), at).toMatchObject({
          dx: big(r.dx),
          dy: big(r.dy),
          shares: big(r.shares),
        });
        expect(printed(rs).at(-1), at).toMatchObject({
          'fee-x': big(r['fee-x']),
          'fee-y': big(r['fee-y']),
        });
        break;
      }
      case 'swap': {
        const tick = big(op.tick);
        const rs = op['x-in']
          ? swapXForY(v.pool, tick, big(op.gross), v.trader)
          : swapYForX(v.pool, tick, big(op.gross), v.trader);
        expect(rs.result.type, at).toBe(Cl.ok(Cl.bool(true)).type);
        const b = bin(v.pool, tick);
        expect([b.x, b.y], at).toEqual([
          big(op.expect['balance-x']),
          big(op.expect['balance-y']),
        ]);
        continue;
      }
      case 'harvest':
        ok(harvest(v));
        break;
      case 'set-manager-fee':
        ok(setManagerFee(v, big(op.phi)));
        break;
      case 'remove': {
        const items = (op.items as [string, string][]).map(([t, pc]) => ({
          tick: big(t),
          percent: big(pc),
        }));
        ok(rebalance(v, items, []));
        break;
      }
      case 'withdraw':
        ok(withdraw(v, big(op.percent)));
        break;
      case 'withdraw-ticks':
        ok(withdrawTicks(v, (op.ticks as string[]).map(big), big(op.percent)));
        break;
      default:
        throw new Error(`unknown op ${op.op}`);
    }
    // the books after every vault operation
    const e = op.expect;
    for (const [t, want] of Object.entries(e.bins)) {
      const tick = BigInt(t);
      const got = position(tick);
      expect(
        {
          n: got.n,
          k: got.k,
          shares: got.shares,
          'client-shares': got['client-shares'],
          'manager-shares': got['manager-shares'],
        },
        `${at} bin ${t}`,
      ).toEqual({
        n: big(want.n),
        k: big(want.k),
        shares: big(want.shares),
        'client-shares': big(want['client-shares']),
        'manager-shares': big(want['manager-shares']),
      });
      const b = bin(v.pool, tick);
      expect([b.x, b.y, b.supply], `${at} bin ${t} reserves`).toEqual([
        big(want['balance-x']),
        big(want['balance-y']),
        big(want.supply),
      ]);
    }
    const t = totals();
    expect(
      { idle: [t.idle.x, t.idle.y], owed: [t.owed.x, t.owed.y], held: t.held },
      at,
    ).toEqual({
      idle: e.idle.map(big),
      owed: e.owed.map(big),
      held: e.held.map(big),
    });
    const client = [
      balanceOf('mock-token-a', v.client),
      balanceOf('mock-token-b', v.client),
    ];
    const recipient = [
      balanceOf('mock-token-a', v.recipient),
      balanceOf('mock-token-b', v.recipient),
    ];
    expect(
      [
        client[0] - start.client[0] + (deposited[0] as bigint),
        client[1] - start.client[1] + (deposited[1] as bigint),
      ],
      `${at} paid to the client`,
    ).toEqual(e.client.map(big));
    expect(
      [recipient[0] - start.recipient[0], recipient[1] - start.recipient[1]],
      `${at} paid to the fee recipient`,
    ).toEqual(e.recipient.map(big));
    checked++;
  }
  expect(checked).toBeGreaterThan(15);
  // the script ends with a full exit and a harvest: nothing left
  expect(totals()).toEqual({
    idle: { x: 0n, y: 0n },
    owed: { x: 0n, y: 0n },
    held: [],
  });
  expect(ONE_8).toBe(100_000_000n);
}, 120_000);
