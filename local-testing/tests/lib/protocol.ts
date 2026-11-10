import type { ParsedTransactionResult } from '@stacks/clarinet-sdk';
import { Cl, type ClarityValue } from '@stacks/transactions';
import { expect } from 'vitest';
import { okOf, okRecord, okUint, plain } from './clarity';

export const accounts = () => simnet.getAccounts();
export function account(name: string): string {
  const a = accounts().get(name);
  if (!a) throw new Error(`unknown account ${name}`);
  return a;
}
export const deployer = () => account('deployer');
export const contract = (name: string) => `${deployer()}.${name}`;
export const token = (name: string) => Cl.contractPrincipal(deployer(), name);

export const ONE_8 = 100_000_000n;
/** The highest fee rate a pool may charge (10%, MAX-FEE-RATE in clmm-pool-v1). */
export const MAX_FEE_RATE = 10_000_000n;
/** A deadline that never passes, for swaps whose test is not about expiry. */
export const FAR_DEADLINE = (1n << 128n) - 1n;
export const WAD = 10n ** 18n;
export const MAX_PRICE = (1n << 128n) - 1n;

export function call(
  name: string,
  fn: string,
  args: ClarityValue[],
  sender: string,
): ParsedTransactionResult {
  return simnet.callPublicFn(name, fn, args, sender);
}

export function ro(name: string, fn: string, args: ClarityValue[] = []) {
  return simnet.callReadOnlyFn(name, fn, args, deployer()).result;
}

/** Hands the DAO to itself via the devnet bootstrap proposal. */
export function bootstrap() {
  const rs = call(
    'executor-dao',
    'construct',
    [Cl.contractPrincipal(deployer(), 'devnet-bootstrap')],
    deployer(),
  );
  expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
}

export function mint(tokenName: string, amount: bigint, recipient: string) {
  const rs = call(
    tokenName,
    'mint',
    [Cl.uint(amount), Cl.principal(recipient)],
    deployer(),
  );
  expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
}

export function balanceOf(tokenName: string, who: string): bigint {
  return okUint(ro(tokenName, 'get-balance', [Cl.principal(who)]));
}

export interface Pool {
  id: bigint;
  x: string;
  y: string;
  binStep: bigint;
}

export function createPool(
  x: string,
  y: string,
  binStep: bigint,
  feeX = 1_000_000n,
  feeY = 1_000_000n,
  rebate = 50_000_000n,
): Pool {
  const rs = call(
    'clmm-pool-v1',
    'create-pool',
    [
      token(x),
      token(y),
      Cl.uint(binStep),
      Cl.uint(feeX),
      Cl.uint(feeY),
      Cl.uint(rebate),
    ],
    deployer(),
  );
  const id = okUint(rs.result);
  return { id, x, y, binStep };
}

export function addLiquidity(
  pool: Pool,
  tick: bigint,
  dx: bigint,
  dy: bigint,
  sender: string,
  opts: { minPrice?: bigint; maxPrice?: bigint; minShares?: bigint } = {},
) {
  return call(
    'clmm-pool-v1',
    'add-to-position',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.int(tick),
      Cl.uint(dx),
      Cl.uint(dy),
      Cl.uint(opts.minPrice ?? 0n),
      Cl.uint(opts.maxPrice ?? MAX_PRICE),
      Cl.uint(opts.minShares ?? 0n),
    ],
    sender,
  );
}

export function removeLiquidity(
  pool: Pool,
  tick: bigint,
  percent: bigint,
  sender: string,
  minDx = 0n,
  minDy = 0n,
) {
  return call(
    'clmm-pool-v1',
    'reduce-position',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.int(tick),
      Cl.uint(percent),
      Cl.uint(minDx),
      Cl.uint(minDy),
    ],
    sender,
  );
}

/** The batched withdrawal: `percent` of `sender`'s shares in each listed bin. */
export function reducePositions(
  pool: Pool,
  items: { tick: bigint; percent: bigint }[],
  sender: string,
  minDx = 0n,
  minDy = 0n,
) {
  return call(
    'clmm-pool-v1',
    'reduce-positions',
    [
      token(pool.x),
      token(pool.y),
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

export function swapXForY(
  pool: Pool,
  tick: bigint,
  dx: bigint,
  sender: string,
  maxPrice = MAX_PRICE,
  minDy = 0n,
  deadline = FAR_DEADLINE,
) {
  return call(
    'clmm-pool-v1',
    'swap-x-for-y-ioc',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.int(tick),
      Cl.uint(dx),
      Cl.uint(maxPrice),
      Cl.uint(minDy),
      Cl.uint(deadline),
    ],
    sender,
  );
}

export function swapYForX(
  pool: Pool,
  tick: bigint,
  dy: bigint,
  sender: string,
  minPrice = 0n,
  minDx = 0n,
  deadline = FAR_DEADLINE,
) {
  return call(
    'clmm-pool-v1',
    'swap-y-for-x-ioc',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.int(tick),
      Cl.uint(dy),
      Cl.uint(minPrice),
      Cl.uint(minDx),
      Cl.uint(deadline),
    ],
    sender,
  );
}

export function bin(pool: Pool, tick: bigint) {
  const v = plain(
    ro('clmm-pool-v1', 'get-pool-balances', [Cl.uint(pool.id), Cl.int(tick)]),
  );
  if (v === null) return { x: 0n, y: 0n, supply: 0n };
  const r = v as Record<string, bigint>;
  return { x: r['balance-x'], y: r['balance-y'], supply: r['total-supply'] };
}

export function poolFees(pool: Pool) {
  const r = plain(
    ro('clmm-pool-v1', 'get-pool-fees', [Cl.uint(pool.id)]),
  ) as Record<string, bigint>;
  return { x: r['fee-x'], y: r['fee-y'] };
}

export function tokenId(pool: Pool, tick: bigint): bigint {
  return pool.id * 2n ** 64n + (tick + 2n ** 32n);
}

export function shares(pool: Pool, tick: bigint, who: string): bigint {
  return okUint(
    ro('clmm-lp-token-v1', 'get-balance', [
      Cl.uint(tokenId(pool, tick)),
      Cl.principal(who),
    ]),
  );
}

export function binPrice(pool: Pool, tick: bigint): bigint {
  return okUint(
    ro('clmm-pool-v1', 'get-bin-price', [Cl.uint(pool.id), Cl.int(tick)]),
  );
}

export function liquidity(
  binStep: bigint,
  tick: bigint,
  x: bigint,
  y: bigint,
): bigint {
  return okUint(
    ro('clmm-pool-v1', 'get-bin-liquidity', [
      Cl.uint(binStep),
      Cl.int(tick),
      Cl.uint(x),
      Cl.uint(y),
    ]),
  );
}

export { okOf, okRecord, okUint, plain };
