/**
 * Wallet-level safety: users can sign protocol calls with strict
 * post-conditions in deny mode (every asset movement listed). Any extra
 * movement aborts the transaction.
 */
import { Cl, Pc } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  account,
  addLiquidity,
  bootstrap,
  contract,
  createPool,
  FAR_DEADLINE,
  mint,
  okRecord,
  type Pool,
  token,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');

function swap(
  pool: Pool,
  dx: bigint,
  sender: string,
  postConditions: ReturnType<typeof Pc.principal>[] | unknown[],
) {
  return simnet.callPublicFn(
    'clmm-pool-v1',
    'swap-x-for-y-ioc',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.int(0),
      Cl.uint(dx),
      Cl.uint((1n << 128n) - 1n),
      Cl.uint(0),
      Cl.uint(FAR_DEADLINE),
    ],
    sender,
    // builder output types differ per asset kind
    { postConditions: postConditions as any, postConditionMode: 'deny' },
  );
}

beforeEach(() => {
  bootstrap();
  mint('mock-token-a', 10n ** 20n, w1());
  mint('mock-token-a', 10n ** 20n, w2());
});

describe('strict post-conditions', () => {
  it('a swap with exactly-listed movements succeeds; any mismatch aborts', () => {
    const pool = createPool('mock-token-stx', 'mock-token-a', 100n);
    addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    const quote = okRecord(
      simnet.callReadOnlyFn(
        'clmm-pool-v1',
        'quote-swap-x-for-y',
        [
          Cl.uint(pool.id),
          Cl.int(0),
          Cl.uint(10n ** 9n),
          Cl.uint((1n << 128n) - 1n),
        ],
        w2(),
      ).result,
    );
    const tokenA = contract('mock-token-a') as `${string}.${string}`;
    const good = [
      Pc.principal(w2())
        .willSendEq(10n ** 9n)
        .ustx(),
      Pc.principal(contract('clmm-pool-v1'))
        .willSendGte(quote.out)
        .ft(tokenA, 'token-a'),
    ];
    expect(okRecord(swap(pool, 10n ** 9n, w2(), good).result).dy).toBe(
      quote.out,
    );

    // the pool paying out anything not listed (here: token-a undeclared) aborts
    const missing = [
      Pc.principal(w2())
        .willSendEq(10n ** 9n)
        .ustx(),
    ];
    expect(() => swap(pool, 10n ** 9n, w2(), missing)).toThrow(
      /Post-condition check failure/,
    );
    // and so does a pool paying less than the signed minimum
    const tooMuch = [
      Pc.principal(w2())
        .willSendEq(10n ** 9n)
        .ustx(),
      Pc.principal(contract('clmm-pool-v1'))
        .willSendGte(quote.out * 2n)
        .ft(tokenA, 'token-a'),
    ];
    expect(() => swap(pool, 10n ** 9n, w2(), tooMuch)).toThrow(
      /Post-condition check failure/,
    );
  });
});
