/**
 * Private pools: a pool may name one depositor, the only address that adds
 * liquidity. Anyone trades against it and anyone holding its shares
 * withdraws, including a former depositor. Private pools are not indexed by
 * key, so they sit beside the public pool of the same tokens and bin step.
 */
import { Cl, type ClarityValue } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, okOf, okRecord, plain } from '../lib/clarity';
import {
  account,
  addLiquidity,
  bootstrap,
  call,
  createPool,
  deployer,
  FAR_DEADLINE,
  MAX_PRICE,
  mint,
  ONE_8,
  type Pool,
  removeLiquidity,
  ro,
  shares,
  swapXForY,
  swapYForX,
  token,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');
const w3 = () => account('wallet_3');
const AMOUNT = 10n ** 12n;

function createPrivate(
  x: string,
  y: string,
  binStep: bigint,
  depositor: string,
  sender = deployer(),
) {
  return call(
    'clmm-pool-v1',
    'create-private-pool',
    [
      token(x),
      token(y),
      Cl.uint(binStep),
      Cl.uint(1_000_000n),
      Cl.uint(1_000_000n),
      Cl.uint(50_000_000n),
      Cl.principal(depositor),
    ],
    sender,
  );
}

function privatePool(x: string, y: string, binStep: bigint, depositor: string) {
  const id = okOf(createPrivate(x, y, binStep, depositor).result) as bigint;
  return { id, x, y, binStep } as Pool;
}

function setDepositor(pool: Pool, depositor: string, sender = deployer()) {
  return call(
    'clmm-pool-v1',
    'set-pool-depositor',
    [Cl.uint(pool.id), Cl.principal(depositor)],
    sender,
  );
}

function printed(events: { event: string; data: { value?: ClarityValue } }[]) {
  return events
    .filter((e) => e.event === 'print_event' && e.data.value)
    .map((e) => plain(e.data.value as ClarityValue) as Record<string, unknown>);
}

function routerAdd(pool: Pool, tick: bigint, sender: string) {
  return call(
    'clmm-router-v1',
    'add-to-positions-many',
    [
      token(pool.x),
      token(pool.y),
      Cl.uint(pool.id),
      Cl.list([
        Cl.tuple({
          tick: Cl.int(tick),
          'max-x': Cl.uint(AMOUNT),
          'max-y': Cl.uint(AMOUNT),
          'min-price': Cl.uint(0),
          'max-price': Cl.uint(MAX_PRICE),
          'min-shares': Cl.uint(0),
        }),
      ]),
    ],
    sender,
  );
}

describe('private pools', () => {
  beforeEach(() => {
    bootstrap();
    for (const w of [w1(), w2(), w3()])
      for (const t of ['mock-token-a', 'mock-token-b', 'mock-token-c'])
        mint(t, 10n ** 20n, w);
  });

  it('only the depositor adds liquidity, directly or through the router', () => {
    const pool = privatePool('mock-token-a', 'mock-token-b', 100n, w1());
    okRecord(addLiquidity(pool, 0n, AMOUNT, AMOUNT, w1()).result);
    expect(errCode(addLiquidity(pool, 0n, AMOUNT, AMOUNT, w2()).result)).toBe(
      1006n,
    );
    expect(errCode(addLiquidity(pool, 1n, 0n, AMOUNT, w2()).result)).toBe(
      1006n,
    );
    expect(errCode(routerAdd(pool, 2n, w2()).result)).toBe(1006n);
    okOf(routerAdd(pool, 2n, w1()).result);
    expect(shares(pool, 0n, w2())).toBe(0n);
    expect(shares(pool, 2n, w2())).toBe(0n);
  });

  it('anyone trades against it', () => {
    const pool = privatePool('mock-token-a', 'mock-token-b', 100n, w1());
    for (const t of [0n, 1n, 2n])
      okRecord(addLiquidity(pool, t, AMOUNT, AMOUNT, w1()).result);
    expect(
      okRecord(swapXForY(pool, 0n, 10n ** 9n, w3()).result).dy,
    ).toBeGreaterThan(0n);
    expect(
      okRecord(swapYForX(pool, 0n, 10n ** 9n, w3()).result).dx,
    ).toBeGreaterThan(0n);
    const route = call(
      'clmm-router-v1',
      'swap-x-for-y',
      [
        token(pool.x),
        token(pool.y),
        Cl.uint(pool.id),
        Cl.uint(10n ** 11n),
        Cl.uint(MAX_PRICE),
        Cl.list([0n, 1n, 2n].map((t) => Cl.int(t))),
        Cl.uint(0),
        Cl.bool(true),
        Cl.uint(FAR_DEADLINE),
      ],
      w3(),
    );
    expect(okRecord(route.result).dy).toBeGreaterThan(0n);
  });

  it('anyone holding shares withdraws, including the old depositor', () => {
    const pool = privatePool('mock-token-a', 'mock-token-b', 100n, w1());
    okRecord(addLiquidity(pool, 0n, AMOUNT, AMOUNT, w1()).result);
    okOf(setDepositor(pool, w2()).result);
    expect(errCode(addLiquidity(pool, 0n, AMOUNT, AMOUNT, w1()).result)).toBe(
      1006n,
    );
    okRecord(addLiquidity(pool, 0n, AMOUNT, AMOUNT, w2()).result);
    // withdrawals ignore the pause and sunset flags, as in a public pool
    okOf(
      call(
        'clmm-pool-v1',
        'set-pool-status',
        [Cl.uint(pool.id), Cl.bool(true), Cl.bool(true)],
        deployer(),
      ).result,
    );
    okRecord(removeLiquidity(pool, 0n, ONE_8, w1()).result);
    okRecord(removeLiquidity(pool, 0n, ONE_8, w2()).result);
    expect(shares(pool, 0n, w1())).toBe(0n);
    expect(shares(pool, 0n, w2())).toBe(0n);
  });

  it('keeps the pause and sunset rules for its depositor', () => {
    const pool = privatePool('mock-token-a', 'mock-token-b', 100n, w1());
    const status = (sunset: boolean, paused: boolean) =>
      okOf(
        call(
          'clmm-pool-v1',
          'set-pool-status',
          [Cl.uint(pool.id), Cl.bool(sunset), Cl.bool(paused)],
          deployer(),
        ).result,
      );
    status(false, true);
    expect(errCode(addLiquidity(pool, 0n, AMOUNT, AMOUNT, w1()).result)).toBe(
      1001n,
    );
    status(true, false);
    expect(errCode(addLiquidity(pool, 0n, AMOUNT, AMOUNT, w1()).result)).toBe(
      1002n,
    );
  });

  it('sits beside the public pool of its key, and several share a key', () => {
    const pub = createPool('mock-token-a', 'mock-token-b', 100n);
    const p1 = privatePool('mock-token-a', 'mock-token-b', 100n, w1());
    const p2 = privatePool('mock-token-a', 'mock-token-b', 100n, w2());
    expect(new Set([pub.id, p1.id, p2.id]).size).toBe(3);
    const key = Cl.tuple({
      'token-x': token('mock-token-a'),
      'token-y': token('mock-token-b'),
      'bin-step': Cl.uint(100),
    });
    expect(plain(ro('clmm-pool-v1', 'get-pool-id', [key]))).toBe(pub.id);
    // the key stays free for a public pool created after a private one
    privatePool('mock-token-a', 'mock-token-c', 500n, w1());
    const later = createPool('mock-token-a', 'mock-token-c', 500n);
    expect(later.id).toBeGreaterThan(0n);
    const dup = call(
      'clmm-pool-v1',
      'create-pool',
      [
        token('mock-token-a'),
        token('mock-token-b'),
        Cl.uint(100),
        Cl.uint(1_000_000n),
        Cl.uint(1_000_000n),
        Cl.uint(50_000_000n),
      ],
      deployer(),
    );
    expect(errCode(dup.result)).toBe(2000n);
    // public and private pools of one key keep separate bins and shares
    okRecord(addLiquidity(pub, 0n, AMOUNT, AMOUNT, w2()).result);
    okRecord(addLiquidity(p1, 0n, AMOUNT, AMOUNT, w1()).result);
    expect(shares(pub, 0n, w1())).toBe(0n);
    expect(shares(p1, 0n, w2())).toBe(0n);
  });

  it('creating and moving a private pool is governance-only', () => {
    expect(
      errCode(
        createPrivate('mock-token-a', 'mock-token-b', 100n, w1(), w1()).result,
      ),
    ).toBe(1000n);
    const pool = privatePool('mock-token-a', 'mock-token-b', 100n, w1());
    expect(errCode(setDepositor(pool, w1(), w1()).result)).toBe(1000n);
    expect(errCode(setDepositor({ ...pool, id: 99n }, w2()).result)).toBe(
      1003n,
    );
    const pub = createPool('mock-token-a', 'mock-token-c', 100n);
    expect(errCode(setDepositor(pub, w1()).result)).toBe(1008n);
  });

  it('applies the checks of create-pool and lists both tokens', () => {
    expect(
      errCode(createPrivate('mock-token-a', 'mock-token-a', 100n, w1()).result),
    ).toBe(1004n);
    expect(
      errCode(createPrivate('mock-token-a', 'mock-token-b', 300n, w1()).result),
    ).toBe(2003n);
    const badFee = call(
      'clmm-pool-v1',
      'create-private-pool',
      [
        token('mock-token-a'),
        token('mock-token-b'),
        Cl.uint(100),
        Cl.uint(ONE_8),
        Cl.uint(0),
        Cl.uint(0),
        Cl.principal(w1()),
      ],
      deployer(),
    );
    expect(errCode(badFee.result)).toBe(2008n);
    privatePool('mock-token-a', 'mock-token-c', 100n, w1());
    const flag = call(
      'clmm-pool-v1',
      'set-native-stx-token',
      [token('mock-token-c'), Cl.bool(true)],
      deployer(),
    );
    expect(errCode(flag.result)).toBe(1005n);
  });

  it('records its depositor and says so in its events', () => {
    const pub = createPool('mock-token-a', 'mock-token-b', 100n);
    expect(
      (
        plain(ro('clmm-pool-v1', 'get-pool', [Cl.uint(pub.id)])) as Record<
          string,
          unknown
        >
      ).depositor,
    ).toBe(null);
    const created = createPrivate('mock-token-a', 'mock-token-b', 100n, w1());
    const id = okOf(created.result) as bigint;
    const [event] = printed(created.events as never);
    expect(event.type).toBe('create-private-pool');
    expect((event.pool as Record<string, unknown>).depositor).toBe(w1());
    expect(
      (
        plain(ro('clmm-pool-v1', 'get-pool', [Cl.uint(id)])) as Record<
          string,
          unknown
        >
      ).depositor,
    ).toBe(w1());
    const moved = setDepositor(
      { id, x: 'mock-token-a', y: 'mock-token-b', binStep: 100n },
      w2(),
    );
    const [move] = printed(moved.events as never);
    expect(move).toMatchObject({
      type: 'set-pool-depositor',
      'pool-id': id,
      'old-depositor': w1(),
      depositor: w2(),
    });
  });
});
