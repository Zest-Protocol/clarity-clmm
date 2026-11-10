/**
 * clmm-vault-v1 roles: governance configures the vault once and sets phi,
 * the manager and the fee recipient; the client deposits, withdraws and
 * pauses the manager; the manager adds, removes, rebalances and harvests.
 * Every function prints an event.
 */
import { Cl } from '@stacks/transactions';
import { describe, expect, it } from 'vitest';
import {
  account,
  bootstrap,
  call,
  contract,
  createPool,
  deployer,
  mint,
  ONE_8,
  plain,
  ro,
  token,
} from '../lib/protocol';
import {
  addLiquidity,
  config,
  deposit,
  ERR,
  err,
  harvest,
  ok,
  pair,
  printed,
  rebalance,
  removeLiquidity,
  setManagerFee,
  setupVault,
  totals,
  VAULT,
  vaultAddress,
  vcall,
  withdraw,
  withdrawTicks,
} from '../lib/vault';

const AMOUNT = 10n ** 12n;

function initialize(poolId: bigint, sender = deployer(), phi = 20_000_000n) {
  return vcall(
    'initialize',
    [
      Cl.uint(poolId),
      Cl.principal(account('wallet_1')),
      Cl.principal(account('wallet_2')),
      Cl.principal(account('wallet_3')),
      Cl.uint(phi),
    ],
    sender,
  );
}

function privatePool(depositor: string) {
  const rs = call(
    'clmm-pool-v1',
    'create-private-pool',
    [
      token('mock-token-a'),
      token('mock-token-b'),
      Cl.uint(100),
      Cl.uint(3_000_000),
      Cl.uint(3_000_000),
      Cl.uint(50_000_000),
      Cl.principal(depositor),
    ],
    deployer(),
  );
  return ok(rs) as bigint;
}

describe('vault configuration', () => {
  it('is configured once, by governance, for a pool naming it as depositor', () => {
    bootstrap();
    const id = privatePool(vaultAddress());
    const other = privatePool(account('wallet_5'));
    const pub = createPool('mock-token-a', 'mock-token-b', 100n).id;
    // nothing works before initialize
    const early = vcall(
      'deposit',
      [token('mock-token-a'), token('mock-token-b'), Cl.uint(1), Cl.uint(1)],
      account('wallet_1'),
    );
    expect(err(early)).toBe(ERR.NOT_INITIALIZED);
    expect(err(vcall('pause-manager', [], account('wallet_1')))).toBe(
      ERR.NOT_INITIALIZED,
    );
    expect(err(initialize(id, account('wallet_1')))).toBe(ERR.NOT_AUTHORIZED);
    expect(err(initialize(pub))).toBe(ERR.NOT_DEPOSITOR);
    expect(err(initialize(other))).toBe(ERR.NOT_DEPOSITOR);
    expect(err(initialize(999n))).toBe(ERR.NOT_DEPOSITOR);
    expect(err(initialize(id, deployer(), ONE_8 + 1n))).toBe(ERR.INVALID_FEE);
    // the vault pays only the client and the fee recipient: neither may be
    // the vault itself or the DAO, which never holds listed tokens
    const dao = contract('executor-dao');
    for (const [client, recipient] of [
      [vaultAddress(), account('wallet_3')],
      [account('wallet_1'), vaultAddress()],
      [dao, account('wallet_3')],
      [account('wallet_1'), dao],
    ]) {
      const rs = vcall(
        'initialize',
        [
          Cl.uint(id),
          Cl.principal(client),
          Cl.principal(account('wallet_2')),
          Cl.principal(recipient),
          Cl.uint(0),
        ],
        deployer(),
      );
      expect(err(rs), `${client} ${recipient}`).toBe(ERR.INVALID_ADDRESS);
    }
    const rs = initialize(id);
    expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
    expect(printed(rs).at(-1)).toMatchObject({
      type: 'initialize',
      'pool-id': id,
      'manager-fee': 20_000_000n,
    });
    expect(config()).toMatchObject({
      initialized: true,
      'pool-id': id,
      'token-x': contract('mock-token-a'),
      'token-y': contract('mock-token-b'),
      'native-x': false,
      'native-y': false,
      client: account('wallet_1'),
      manager: account('wallet_2'),
      'fee-recipient': account('wallet_3'),
      'manager-fee': 20_000_000n,
      'manager-paused': false,
    });
    expect(err(initialize(id))).toBe(ERR.ALREADY_INITIALIZED);
  });

  it('goes live through one governance proposal', () => {
    bootstrap();
    const rs = call(
      'devnet-bootstrap',
      'execute-proposal',
      [Cl.contractPrincipal(deployer(), 'devnet-proposal-vault')],
      deployer(),
    );
    expect(rs.result).toEqual(Cl.ok(Cl.bool(true)));
    const cfg = config();
    expect(cfg).toMatchObject({
      initialized: true,
      client: account('wallet_1'),
      manager: account('wallet_2'),
      'fee-recipient': account('wallet_3'),
      'manager-fee': 20_000_000n,
    });
    const pool = plain(
      ro('clmm-pool-v1', 'get-pool', [Cl.uint(cfg['pool-id'] as bigint)]),
    );
    expect(pool).toMatchObject({
      depositor: vaultAddress(),
      'fee-rate-x': 300_000n,
    });
    // the vault works: deposit and add
    const v = {
      pool: {
        id: cfg['pool-id'] as bigint,
        x: 'mock-token-a',
        y: 'mock-token-b',
        binStep: 100n,
      },
      client: account('wallet_1'),
      manager: account('wallet_2'),
      recipient: account('wallet_3'),
      trader: account('wallet_4'),
    };
    mint('mock-token-a', AMOUNT, v.client);
    mint('mock-token-b', AMOUNT, v.client);
    ok(deposit(v, AMOUNT, AMOUNT));
    ok(addLiquidity(v, 0n, AMOUNT, AMOUNT));
  });
});

describe('vault roles', () => {
  it('only the client deposits, withdraws and pauses the manager', () => {
    const v = setupVault();
    const stranger = account('wallet_5');
    for (const who of [v.manager, stranger, deployer()]) {
      expect(err(deposit(v, AMOUNT, AMOUNT, who))).toBe(ERR.NOT_CLIENT);
      expect(err(withdraw(v, ONE_8, who))).toBe(ERR.NOT_CLIENT);
      expect(err(withdrawTicks(v, [], ONE_8, who))).toBe(ERR.NOT_CLIENT);
      expect(err(vcall('pause-manager', [], who))).toBe(ERR.NOT_CLIENT);
      expect(err(vcall('unpause-manager', [], who))).toBe(ERR.NOT_CLIENT);
    }
    const d = deposit(v, AMOUNT, 2n * AMOUNT);
    expect(ok(d)).toEqual({ 'idle-x': AMOUNT, 'idle-y': 2n * AMOUNT });
    expect(printed(d).at(-1)).toMatchObject({
      type: 'deposit',
      dx: AMOUNT,
      dy: 2n * AMOUNT,
    });
    expect(err(deposit(v, 0n, 0n))).toBe(ERR.INVALID_AMOUNT);
    expect(err(withdraw(v, 0n))).toBe(ERR.INVALID_PERCENT);
    expect(err(withdraw(v, ONE_8 + 1n))).toBe(ERR.INVALID_PERCENT);
    const p = vcall('pause-manager', [], v.client);
    expect(p.result).toEqual(Cl.ok(Cl.bool(true)));
    expect(printed(p).at(-1)).toMatchObject({ type: 'pause-manager' });
    expect(config()['manager-paused']).toBe(true);
    const u = vcall('unpause-manager', [], v.client);
    expect(printed(u).at(-1)).toMatchObject({ type: 'unpause-manager' });
    expect(config()['manager-paused']).toBe(false);
  });

  it('only the manager places liquidity and harvests; the pause stops placing only', () => {
    const v = setupVault();
    ok(deposit(v, 10n * AMOUNT, 10n * AMOUNT));
    for (const who of [v.client, account('wallet_5'), deployer()]) {
      expect(err(addLiquidity(v, 0n, AMOUNT, AMOUNT, who))).toBe(
        ERR.NOT_MANAGER,
      );
      expect(err(removeLiquidity(v, 0n, ONE_8, who))).toBe(ERR.NOT_MANAGER);
      expect(err(rebalance(v, [], [], who))).toBe(ERR.NOT_MANAGER);
      expect(err(harvest(v, who))).toBe(ERR.NOT_MANAGER);
    }
    const a = addLiquidity(v, 0n, AMOUNT, AMOUNT);
    expect(ok(a)).toMatchObject({ tick: 0n, dx: AMOUNT, dy: AMOUNT });
    expect(printed(a).at(-1)).toMatchObject({
      type: 'add-liquidity',
      tick: 0n,
    });
    ok(vcall('pause-manager', [], v.client));
    expect(err(addLiquidity(v, 1n, AMOUNT, AMOUNT))).toBe(ERR.MANAGER_PAUSED);
    expect(err(removeLiquidity(v, 0n, ONE_8))).toBe(ERR.MANAGER_PAUSED);
    expect(err(rebalance(v, [], []))).toBe(ERR.MANAGER_PAUSED);
    const h = harvest(v);
    expect(h.result.type).toBe(Cl.ok(Cl.bool(true)).type);
    expect(printed(h).at(-1)).toMatchObject({ type: 'harvest' });
    ok(vcall('unpause-manager', [], v.client));
    const r = removeLiquidity(v, 0n, ONE_8 / 2n);
    expect(printed(r).at(-1)).toMatchObject({ type: 'remove-liquidity' });
    expect(printed(r).find((e) => e.type === 'remove-bin')).toMatchObject({
      tick: 0n,
    });
  });

  it('governance sets phi, the manager and the fee recipient', () => {
    const v = setupVault();
    const stranger = account('wallet_5');
    for (const who of [v.client, v.manager, stranger]) {
      expect(err(setManagerFee(v, 0n, who))).toBe(ERR.NOT_AUTHORIZED);
      expect(err(vcall('set-manager', [Cl.principal(who)], who))).toBe(
        ERR.NOT_AUTHORIZED,
      );
      expect(err(vcall('set-fee-recipient', [Cl.principal(who)], who))).toBe(
        ERR.NOT_AUTHORIZED,
      );
    }
    expect(err(setManagerFee(v, ONE_8 + 1n))).toBe(ERR.INVALID_FEE);
    const f = setManagerFee(v, ONE_8);
    expect(printed(f).at(-1)).toMatchObject({
      type: 'set-manager-fee',
      'old-manager-fee': 20_000_000n,
      'manager-fee': ONE_8,
    });
    expect(config()['manager-fee']).toBe(ONE_8);
    const m = vcall('set-manager', [Cl.principal(stranger)], deployer());
    expect(printed(m).at(-1)).toMatchObject({
      type: 'set-manager',
      manager: stranger,
    });
    ok(deposit(v, AMOUNT, AMOUNT));
    expect(err(addLiquidity(v, 0n, AMOUNT, AMOUNT))).toBe(ERR.NOT_MANAGER);
    ok(addLiquidity(v, 0n, AMOUNT, AMOUNT, stranger));
    for (const who of [vaultAddress(), contract('executor-dao')])
      expect(
        err(vcall('set-fee-recipient', [Cl.principal(who)], deployer())),
      ).toBe(ERR.INVALID_ADDRESS);
    expect(config()['fee-recipient']).toBe(v.recipient);
    const r = vcall('set-fee-recipient', [Cl.principal(stranger)], deployer());
    expect(printed(r).at(-1)).toMatchObject({
      type: 'set-fee-recipient',
      'fee-recipient': stranger,
    });
    expect(config()['fee-recipient']).toBe(stranger);
  });

  it("refuses tokens other than its pool's", () => {
    const v = setupVault();
    const wrong = [token('mock-token-a'), token('mock-token-c')];
    const swapped = [token('mock-token-b'), token('mock-token-a')];
    for (const p of [wrong, swapped]) {
      expect(
        err(vcall('deposit', [...p, Cl.uint(1), Cl.uint(1)], v.client)),
      ).toBe(ERR.INVALID_TOKEN);
      expect(
        err(
          vcall(
            'withdraw',
            [...p, Cl.uint(ONE_8), Cl.uint(0), Cl.uint(0)],
            v.client,
          ),
        ),
      ).toBe(ERR.INVALID_TOKEN);
      expect(err(vcall('harvest', p, v.manager))).toBe(ERR.INVALID_TOKEN);
    }
    expect(totals().held).toEqual([]);
    expect(pair(v)).toHaveLength(2);
    expect(VAULT).toBe('clmm-vault-v1');
  });
});
