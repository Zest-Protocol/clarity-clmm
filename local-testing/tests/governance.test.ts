/**
 * Production governance: contracts/governance/bootstrap.clar hands the DAO
 * to itself, enables only the `operators` multisig as an extension, and
 * every later change is a proposal approved by the operators.
 */
import { Cl } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import { errCode, plain } from './lib/clarity';
import { account, call, deployer, ro, token } from './lib/protocol';

const proposal = (name: string) => Cl.contractPrincipal(deployer(), name);
const approve = (name: string, who: string) =>
  call('operators', 'approve', [proposal(name)], who).result;

describe('production governance', () => {
  it('bootstrap -> proposals through the operators multisig', () => {
    expect(
      call('executor-dao', 'construct', [proposal('bootstrap')], deployer())
        .result,
    ).toEqual(Cl.ok(Cl.bool(true)));
    const isExt = (p: string) =>
      plain(ro('executor-dao', 'is-extension', [Cl.principal(p)]));
    // the operators multisig is the only extension
    expect(isExt(`${deployer()}.operators`)).toBe(true);
    for (const c of ['clmm-pool-v1', 'bootstrap'])
      expect(isExt(`${deployer()}.${c}`)).toBe(false);
    expect(isExt(deployer())).toBe(false);
    expect(plain(ro('operators', 'get-threshold'))).toBe(1n);

    // nobody has direct powers, and the DAO cannot be constructed twice
    expect(
      errCode(
        call(
          'clmm-pool-v1',
          'create-pool',
          [
            token('mock-token-stx'),
            token('mock-token-a'),
            Cl.uint(100),
            Cl.uint(0),
            Cl.uint(0),
            Cl.uint(0),
          ],
          deployer(),
        ).result,
      ),
    ).toBe(1000n);
    expect(
      errCode(
        call('executor-dao', 'construct', [proposal('bootstrap')], deployer())
          .result,
      ),
    ).toBe(1000n);
    expect(
      errCode(
        call('operators', 'set-threshold', [Cl.uint(1)], deployer()).result,
      ),
    ).toBe(4000n);

    // 1-of-1: the deployer lists a pool by proposal
    expect(approve('devnet-proposal-list-pool', deployer())).toEqual(
      Cl.ok(Cl.bool(true)),
    );
    expect(plain(ro('clmm-pool-v1', 'get-pool-count'))).toBe(1n);
    expect(
      plain(
        ro('clmm-pool-v1', 'is-native-stx-token', [
          Cl.principal(`${deployer()}.mock-token-stx`),
        ]),
      ),
    ).toBe(true);

    // rotate to 2-of-3
    expect(approve('devnet-proposal-add-operators', deployer())).toEqual(
      Cl.ok(Cl.bool(true)),
    );
    expect(plain(ro('operators', 'get-threshold'))).toBe(2n);
    expect(plain(ro('operators', 'get-operator-count'))).toBe(3n);

    const [w1, w2, w3] = ['wallet_1', 'wallet_2', 'wallet_3'].map(account);
    expect(approve('devnet-test-proposal', w1)).toEqual(Cl.ok(Cl.bool(false))); // 1 of 2
    expect(errCode(approve('devnet-test-proposal', w1))).toBe(4002n); // no double vote
    expect(errCode(approve('devnet-test-proposal', w3))).toBe(4001n); // not an operator
    // a signer-set change starts a new epoch: w1's pending vote is void
    expect(approve('devnet-proposal-bump-epoch', w1)).toEqual(
      Cl.ok(Cl.bool(false)),
    );
    expect(approve('devnet-proposal-bump-epoch', w2)).toEqual(
      Cl.ok(Cl.bool(true)),
    );
    // bootstrap (1 operator + threshold), rotation (2 operators + threshold), re-set
    expect(plain(ro('operators', 'get-epoch'))).toBe(6n);
    expect(approve('devnet-test-proposal', w2)).toEqual(Cl.ok(Cl.bool(false))); // 1 of 2 again
    expect(approve('devnet-test-proposal', w1)).toEqual(Cl.ok(Cl.bool(true))); // executed
    expect(errCode(approve('devnet-test-proposal', deployer()))).toBe(4003n);

    // approvals expire
    expect(approve('devnet-bootstrap', w1)).toEqual(Cl.ok(Cl.bool(false)));
    simnet.mineEmptyBlocks(241_920);
    expect(errCode(approve('devnet-bootstrap', w2))).toBe(4004n);
  });
});
