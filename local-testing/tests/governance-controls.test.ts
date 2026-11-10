/**
 * The production bootstrap (contracts/governance/bootstrap.clar)
 * does not enable itself as an extension, so its public `execute` cannot be
 * replayed by an outside account, and the deployer gets no extension powers.
 */
import { Cl } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, okRecord, plain } from './lib/clarity';
import {
  account,
  addLiquidity,
  bin,
  call,
  deployer,
  mint,
  ro,
  tokenId,
} from './lib/protocol';

const w1 = () => account('wallet_1');
const proposal = (name: string) => Cl.contractPrincipal(deployer(), name);

beforeEach(() => {
  for (const w of [w1()]) mint('mock-token-a', 10n ** 24n, w);
  expect(
    call('executor-dao', 'construct', [proposal('bootstrap')], deployer())
      .result,
  ).toEqual(Cl.ok(Cl.bool(true)));
});

describe('production bootstrap is not replayable', () => {
  it('an outside account cannot re-run bootstrap.execute', () => {
    expect(
      errCode(call('bootstrap', 'execute', [Cl.principal(w1())], w1()).result),
    ).toBe(1n); // only the executor-dao may run a proposal
    expect(
      plain(
        ro('executor-dao', 'is-extension', [
          Cl.principal(`${deployer()}.bootstrap`),
        ]),
      ),
    ).toBe(false);
  });

  it('an outside account cannot enable extensions, add operators or set the threshold', () => {
    expect(
      errCode(
        call(
          'executor-dao',
          'set-extension',
          [Cl.principal(w1()), Cl.bool(true)],
          w1(),
        ).result,
      ),
    ).toBe(1000n);
    expect(
      errCode(
        call(
          'operators',
          'set-operator',
          [Cl.principal(w1()), Cl.bool(true)],
          w1(),
        ).result,
      ),
    ).toBe(4000n);
    expect(
      errCode(call('operators', 'set-threshold', [Cl.uint(1)], w1()).result),
    ).toBe(4000n);
  });

  it('the deployer is not an extension, so it cannot mint LP shares (listing goes through the operators)', () => {
    // the deployer (1-of-1 operator) lists a pool by proposal, as in tests/governance.test.ts
    expect(
      call(
        'operators',
        'approve',
        [Cl.contractPrincipal(deployer(), 'devnet-proposal-list-pool')],
        deployer(),
      ).result,
    ).toEqual(Cl.ok(Cl.bool(true)));
    mint('mock-token-a', 10n ** 12n, deployer());
    const pool = {
      id: 1n,
      x: 'mock-token-stx',
      y: 'mock-token-a',
      binStep: 100n,
    };
    expect(
      okRecord(addLiquidity(pool, 0n, 10n ** 6n, 10n ** 6n, deployer()).result)
        .shares,
    ).toBeGreaterThan(0n);
    const tid = tokenId(pool, 0n);
    expect(
      errCode(
        call(
          'clmm-lp-token-v1',
          'mint',
          [
            Cl.uint(tid),
            Cl.uint(bin(pool, 0n).supply),
            Cl.principal(deployer()),
          ],
          deployer(),
        ).result,
      ),
    ).toBe(1000n);
  });
});
