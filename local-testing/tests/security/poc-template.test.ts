/**
 * Start here: a template for a proof of concept.
 *
 * Copy this file, set up the state you need in beforeEach, and turn the claim
 * you are attacking into an `expect`. A good report includes a test that fails
 * against an invariant below, or one that shows funds moving where they should
 * not. Accounts: wallet_1 is an honest LP and wallet_2 the attacker; the
 * deployer is a DAO extension under the devnet bootstrap, so a finding that needs
 * the deployer's power is a governance finding, not an outside attack (use the
 * production bootstrap in tests/setup/protocol-init.test.ts to rule that out).
 *
 * Useful tools:
 *  - rs.events on a call result lists prints and token movements;
 *  - simnet.mineEmptyBlocks(n) moves time forward;
 *  - contracts/mocks/mock-token-evil.clar is a hostile SIP-010 token with
 *    selectable behaviour (see tests/amm/security.test.ts).
 */
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
  mint,
  ONE_8,
  okRecord,
  type Pool,
  poolFees,
  removeLiquidity,
  shares,
  token,
  tokenId,
  WAD,
} from '../lib/protocol';

const lp = () => account('wallet_1');
const attacker = () => account('wallet_2');
const POOL = () => contract('clmm-pool-v1');

/** The pool holds exactly its bins' reserves plus the protocol fees. */
function expectSolvent(pool: Pool, ticks: bigint[]) {
  const fees = poolFees(pool);
  let x = fees.x;
  let y = fees.y;
  for (const t of ticks) {
    x += bin(pool, t).x;
    y += bin(pool, t).y;
  }
  expect(balanceOf(pool.x, POOL())).toBe(x);
  expect(balanceOf(pool.y, POOL())).toBe(y);
}

describe('proof-of-concept template', () => {
  let pool: Pool;

  beforeEach(() => {
    bootstrap();
    for (const w of [lp(), attacker()]) {
      mint('mock-token-a', 10n ** 24n, w);
      mint('mock-token-b', 10n ** 24n, w);
    }
    pool = createPool('mock-token-a', 'mock-token-b', 100n);
    addLiquidity(pool, 0n, 10n ** 15n, 10n ** 15n, lp());
  });

  it('an outsider cannot use governance functions or mint shares', () => {
    const notAuthorized = 1000n;
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'set-pool-status',
          [Cl.uint(pool.id), Cl.bool(false), Cl.bool(true)],
          attacker(),
        ).result,
      ),
    ).toBe(notAuthorized);
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'claim-fees',
          [
            token(pool.x),
            token(pool.y),
            Cl.uint(pool.id),
            Cl.principal(attacker()),
          ],
          attacker(),
        ).result,
      ),
    ).toBe(notAuthorized);
    expect(
      errCode(
        call(
          'clmm-lp-token-v1',
          'mint',
          [
            Cl.uint(tokenId(pool, 0n)),
            Cl.uint(1n),
            Cl.principal(attacker()),
          ],
          attacker(),
        ).result,
      ),
    ).toBe(notAuthorized);
  });

  it('a deposit and full withdrawal does not make the attacker money', () => {
    const dx = 10n ** 12n;
    const beforeX = balanceOf(pool.x, attacker());
    const beforeY = balanceOf(pool.y, attacker());

    addLiquidity(pool, 0n, dx, 0n, attacker());
    expect(shares(pool, 0n, attacker())).toBeGreaterThan(0n);
    const out = okRecord(removeLiquidity(pool, 0n, ONE_8, attacker()).result);
    expect(shares(pool, 0n, attacker())).toBe(0n);

    // value the round trip at the bin's price afterwards (raw X per raw Y)
    const gainedY = balanceOf(pool.y, attacker()) - beforeY;
    const lostX = beforeX - balanceOf(pool.x, attacker());
    expect(gainedY).toBe(out.dy);
    expect((gainedY * binPrice(pool, 0n)) / WAD).toBeLessThan(lostX);
    expectSolvent(pool, [0n]);
  });
});
