import type { ParsedTransactionResult } from '@stacks/clarinet-sdk';
import { Cl, type ClarityValue } from '@stacks/transactions';
import { expect } from 'vitest';
import { errCode, okOf, okRecord, plain } from './clarity';
import {
  account,
  bootstrap,
  call,
  contract,
  deployer,
  FAR_DEADLINE,
  MAX_PRICE,
  mint,
  ONE_8,
  type Pool,
  ro,
  token,
} from './protocol';

export let VAULT = 'clmm-vault-v1';
/** Runs the helpers on another deployment of the vault's source. */
export const useVault = (name: string) => {
  VAULT = name;
};
export const vaultAddress = () => contract(VAULT);

export interface Vault {
  pool: Pool;
  client: string;
  manager: string;
  recipient: string;
  trader: string;
}

export interface VaultOptions {
  x?: string;
  y?: string;
  binStep?: bigint;
  fee?: bigint;
  rebate?: bigint;
  phi?: bigint;
  /** mint this much of each token to the client and the trader */
  supply?: bigint;
  /** a public pool instead of a private one naming the vault */
  publicPool?: boolean;
}

/** A private pool naming the vault as depositor, and the vault configured
 * for it by governance: client wallet_1, manager wallet_2, fee recipient
 * wallet_3, trader wallet_4. */
export function setupVault(opts: VaultOptions = {}): Vault {
  bootstrap();
  const x = opts.x ?? 'mock-token-a';
  const y = opts.y ?? 'mock-token-b';
  const binStep = opts.binStep ?? 100n;
  const fee = opts.fee ?? 3_000_000n;
  const v: Vault = {
    pool: { id: 0n, x, y, binStep },
    client: account('wallet_1'),
    manager: account('wallet_2'),
    recipient: account('wallet_3'),
    trader: account('wallet_4'),
  };
  const created = call(
    'clmm-pool-v1',
    opts.publicPool ? 'create-pool' : 'create-private-pool',
    [
      token(x),
      token(y),
      Cl.uint(binStep),
      Cl.uint(fee),
      Cl.uint(fee),
      Cl.uint(opts.rebate ?? 50_000_000n),
      ...(opts.publicPool ? [] : [Cl.principal(vaultAddress())]),
    ],
    deployer(),
  );
  v.pool.id = okOf(created.result) as bigint;
  const init = call(
    VAULT,
    'initialize',
    [
      Cl.uint(v.pool.id),
      Cl.principal(v.client),
      Cl.principal(v.manager),
      Cl.principal(v.recipient),
      Cl.uint(opts.phi ?? 20_000_000n),
    ],
    deployer(),
  );
  expect(init.result).toEqual(Cl.ok(Cl.bool(true)));
  const supply = opts.supply ?? 10n ** 24n;
  for (const t of [x, y]) {
    if (t === 'mock-token-stx') continue;
    mint(t, supply, v.client);
    mint(t, supply, v.trader);
  }
  return v;
}

export const pair = (v: Vault) => [token(v.pool.x), token(v.pool.y)];

export function vcall(
  fn: string,
  args: ClarityValue[],
  sender: string,
): ParsedTransactionResult {
  return call(VAULT, fn, args, sender);
}

export function deposit(v: Vault, dx: bigint, dy: bigint, sender = v.client) {
  return vcall('deposit', [...pair(v), Cl.uint(dx), Cl.uint(dy)], sender);
}

export function withdraw(
  v: Vault,
  percent = ONE_8,
  sender = v.client,
  minDx = 0n,
  minDy = 0n,
) {
  return vcall(
    'withdraw',
    [...pair(v), Cl.uint(percent), Cl.uint(minDx), Cl.uint(minDy)],
    sender,
  );
}

export function withdrawTicks(
  v: Vault,
  ticks: bigint[],
  percent = ONE_8,
  sender = v.client,
) {
  return vcall(
    'withdraw-ticks',
    [
      ...pair(v),
      Cl.list(ticks.map((t) => Cl.int(t))),
      Cl.uint(percent),
      Cl.uint(0),
      Cl.uint(0),
    ],
    sender,
  );
}

export interface AddSpec {
  tick: bigint;
  maxX: bigint;
  maxY: bigint;
  minPrice?: bigint;
  maxPrice?: bigint;
}

const addTuple = (a: AddSpec) =>
  Cl.tuple({
    tick: Cl.int(a.tick),
    'max-x': Cl.uint(a.maxX),
    'max-y': Cl.uint(a.maxY),
    'min-price': Cl.uint(a.minPrice ?? 0n),
    'max-price': Cl.uint(a.maxPrice ?? MAX_PRICE),
  });

/** The manager's placements take a trailing deadline (seconds), by default
 * one that never passes. */
export function addLiquidity(
  v: Vault,
  tick: bigint,
  maxX: bigint,
  maxY: bigint,
  sender = v.manager,
  deadline = FAR_DEADLINE,
) {
  return vcall(
    'add-liquidity',
    [
      ...pair(v),
      Cl.int(tick),
      Cl.uint(maxX),
      Cl.uint(maxY),
      Cl.uint(0),
      Cl.uint(MAX_PRICE),
      Cl.uint(deadline),
    ],
    sender,
  );
}

export function removeLiquidity(
  v: Vault,
  tick: bigint,
  percent: bigint,
  sender = v.manager,
  deadline = FAR_DEADLINE,
) {
  return vcall(
    'remove-liquidity',
    [...pair(v), Cl.int(tick), Cl.uint(percent), Cl.uint(deadline)],
    sender,
  );
}

export function rebalance(
  v: Vault,
  removes: { tick: bigint; percent: bigint }[],
  adds: AddSpec[],
  sender = v.manager,
  deadline = FAR_DEADLINE,
) {
  return vcall(
    'rebalance',
    [
      ...pair(v),
      Cl.list(
        removes.map((r) =>
          Cl.tuple({ tick: Cl.int(r.tick), percent: Cl.uint(r.percent) }),
        ),
      ),
      Cl.list(adds.map(addTuple)),
      Cl.uint(deadline),
    ],
    sender,
  );
}

export function harvest(v: Vault, sender = v.manager) {
  return vcall('harvest', pair(v), sender);
}

export function setManagerFee(v: Vault, phi: bigint, sender = deployer()) {
  return vcall('set-manager-fee', [...pair(v), Cl.uint(phi)], sender);
}

export interface Position {
  n: bigint;
  k: bigint;
  shares: bigint;
  'client-shares': bigint;
  'manager-shares': bigint;
  'client-x': bigint;
  'client-y': bigint;
  'manager-x': bigint;
  'manager-y': bigint;
}

export function position(tick: bigint): Position {
  return okRecord(
    ro(VAULT, 'get-position', [Cl.int(tick)]),
  ) as unknown as Position;
}

export function totals() {
  const t = plain(ro(VAULT, 'get-totals')) as {
    idle: { x: bigint; y: bigint };
    owed: { x: bigint; y: bigint };
    held: bigint[];
  };
  return t;
}

export function config() {
  return plain(ro(VAULT, 'get-config')) as Record<string, unknown>;
}

/** The (ok ...) record of a call, failing loudly otherwise. */
export function ok(rs: ParsedTransactionResult) {
  return okOf(rs.result);
}

export function err(rs: ParsedTransactionResult): bigint {
  return errCode(rs.result);
}

export function printed(rs: ParsedTransactionResult) {
  return rs.events
    .filter((e) => e.event === 'print_event' && e.data.value)
    .map((e) => plain(e.data.value as ClarityValue) as Record<string, unknown>);
}

export const ERR = {
  NOT_AUTHORIZED: 1000n,
  NOT_CLIENT: 6001n,
  NOT_MANAGER: 6002n,
  MANAGER_PAUSED: 6003n,
  NOT_INITIALIZED: 6004n,
  ALREADY_INITIALIZED: 6005n,
  NOT_DEPOSITOR: 6006n,
  INVALID_TOKEN: 6007n,
  INVALID_FEE: 6008n,
  INVALID_ADDRESS: 6009n,
  TOO_MANY_BINS: 6010n,
  NOT_HELD: 6011n,
  TICK_ORDER: 6012n,
  INVALID_PERCENT: 6013n,
  INVALID_AMOUNT: 6014n,
  DEPOSIT_FEE: 6015n,
  VALUE_FELL: 6016n,
  POOL_MISMATCH: 6017n,
  TRANSFER_MISMATCH: 6018n,
  SLIPPAGE: 6019n,
  EXPIRED: 6020n,
} as const;
