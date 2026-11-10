/**
 * Initialization reference. Two ways to bring the protocol up on simnet:
 *
 *  - devnet-bootstrap (contracts/mocks/bootstrap.clar) also makes the deployer
 *    a DAO extension, so a test can list pools directly. Most
 *    tests in this suite use it, through bootstrap() in tests/lib/protocol.ts.
 *  - bootstrap (contracts/governance/bootstrap.clar) is the production
 *    proposal: the deployer gets no powers, and every later change goes through
 *    the operators multisig. Use it when a finding depends on real governance.
 *
 * Under both, the pool is not a DAO extension: it needs no DAO authority.
 */
import { Cl } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, plain } from '../lib/clarity';
import {
  account,
  addLiquidity,
  bin,
  bootstrap,
  call,
  contract,
  createPool,
  deployer,
  mint,
  ONE_8,
  okRecord,
  removeLiquidity,
  ro,
  swapXForY,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');
const isExtension = (who: string) =>
  plain(ro('executor-dao', 'is-extension', [Cl.principal(who)]));

describe('devnet bootstrap (what most tests start from)', () => {
  beforeEach(() => {
    bootstrap();
    for (const w of [w1(), w2()]) {
      mint('mock-token-a', 10n ** 20n, w);
      mint('mock-token-b', 10n ** 20n, w);
    }
  });

  it('enables the deployer as an extension, not the protocol contracts', () => {
    expect(isExtension(deployer())).toBe(true);
    expect(isExtension(contract('clmm-pool-v1'))).toBe(false);
  });

  it('runs a pool through deposit, swap and withdrawal', () => {
    const pool = createPool('mock-token-a', 'mock-token-b', 100n);
    expect(pool.id).toBe(1n);

    const added = addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
    expect(okRecord(added.result).shares).toBeGreaterThan(0n);

    const swapped = okRecord(swapXForY(pool, 0n, 10n ** 9n, w2()).result);
    expect(swapped.dx).toBe(10n ** 9n);
    expect(swapped.dy).toBeGreaterThan(0n);

    // the 1,000 shares locked by the first deposit stay in the bin
    const left = okRecord(removeLiquidity(pool, 0n, ONE_8, w1()).result);
    expect(left.shares).toBeGreaterThan(0n);
    expect(bin(pool, 0n).supply).toBe(1000n);
  });
});

describe('production bootstrap', () => {
  const construct = () =>
    call(
      'executor-dao',
      'construct',
      [Cl.contractPrincipal(deployer(), 'bootstrap')],
      deployer(),
    ).result;

  it('enables only the operators multisig and seeds it', () => {
    expect(construct()).toEqual(Cl.ok(Cl.bool(true)));

    expect(isExtension(contract('operators'))).toBe(true);
    expect(isExtension(contract('clmm-pool-v1'))).toBe(false);
    expect(isExtension(deployer())).toBe(false);

    // the shipped defaults: 1-of-1, the deployer (see docs/dao.md, bootstrap)
    expect(plain(ro('operators', 'get-threshold'))).toBe(1n);
    expect(plain(ro('operators', 'get-operator-count'))).toBe(1n);
    expect(
      plain(ro('operators', 'is-operator', [Cl.principal(deployer())])),
    ).toBe(true);
  });

  it('can only be constructed once, by the deployer', () => {
    const asOutsider = call(
      'executor-dao',
      'construct',
      [Cl.contractPrincipal(deployer(), 'bootstrap')],
      w1(),
    ).result;
    expect(errCode(asOutsider)).toBe(1000n);

    expect(construct()).toEqual(Cl.ok(Cl.bool(true)));
    expect(errCode(construct())).toBe(1000n);
  });
});
