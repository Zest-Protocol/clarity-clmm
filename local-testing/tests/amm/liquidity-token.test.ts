import { Cl } from '@stacks/transactions';
import { beforeEach, describe, expect, it } from 'vitest';
import { errCode, plain } from '../lib/clarity';
import {
  account,
  addLiquidity,
  bootstrap,
  call,
  createPool,
  deployer,
  mint,
  okUint,
  type Pool,
  ro,
  shares,
  tokenId,
} from '../lib/protocol';

const w1 = () => account('wallet_1');
const w2 = () => account('wallet_2');
const w3 = () => account('wallet_3');
const LP = 'clmm-lp-token-v1';

let pool: Pool;
beforeEach(() => {
  bootstrap();
  mint('mock-token-a', 10n ** 20n, w1());
  mint('mock-token-b', 10n ** 20n, w1());
  pool = createPool('mock-token-a', 'mock-token-b', 100n);
  addLiquidity(pool, 0n, 10n ** 12n, 10n ** 12n, w1());
  addLiquidity(pool, 1n, 10n ** 12n, 10n ** 12n, w1());
});

describe('clmm-lp-token-v1 (SIP-013)', () => {
  it('reports balances and supplies per id and overall', () => {
    const id0 = tokenId(pool, 0n);
    const id1 = tokenId(pool, 1n);
    const s0 = okUint(ro(LP, 'get-total-supply', [Cl.uint(id0)]));
    const s1 = okUint(ro(LP, 'get-total-supply', [Cl.uint(id1)]));
    expect(okUint(ro(LP, 'get-overall-supply'))).toBe(s0 + s1);
    expect(okUint(ro(LP, 'get-overall-balance', [Cl.principal(w1())]))).toBe(
      shares(pool, 0n, w1()) + shares(pool, 1n, w1()),
    );
    expect(okUint(ro(LP, 'get-decimals', [Cl.uint(id0)]))).toBe(0n);
    expect(plain(ro(LP, 'get-transferrable'))).toEqual({ ok: true });
    // ids round-trip through the pool's encoding
    expect(
      plain(ro('clmm-pool-v1', 'parse-liquidity-token-id', [Cl.uint(id1)])),
    ).toEqual({ 'pool-id': pool.id, tick: 1n });
    expect(
      plain(
        ro('clmm-pool-v1', 'parse-liquidity-token-id', [
          Cl.uint(tokenId(pool, -4458n)),
        ]),
      ),
    ).toEqual({ 'pool-id': pool.id, tick: -4458n });
  });

  it('transfers many ids in one call, atomically', () => {
    const id0 = tokenId(pool, 0n);
    const id1 = tokenId(pool, 1n);
    const item = (id: bigint, amount: bigint, to: string) =>
      Cl.tuple({
        'token-id': Cl.uint(id),
        amount: Cl.uint(amount),
        sender: Cl.principal(w1()),
        recipient: Cl.principal(to),
      });
    expect(
      call(
        LP,
        'transfer-many',
        [Cl.list([item(id0, 5n, w2()), item(id1, 7n, w3())])],
        w1(),
      ).result,
    ).toEqual(Cl.ok(Cl.bool(true)));
    expect(shares(pool, 0n, w2())).toBe(5n);
    expect(shares(pool, 1n, w3())).toBe(7n);
    // one bad item reverts the whole batch
    const before = shares(pool, 0n, w2());
    expect(
      errCode(
        call(
          LP,
          'transfer-many',
          [Cl.list([item(id0, 1n, w2()), item(id1, 10n ** 30n, w3())])],
          w1(),
        ).result,
      ),
    ).toBe(1n);
    expect(shares(pool, 0n, w2())).toBe(before);
    const memo = Cl.tuple({
      'token-id': Cl.uint(id0),
      amount: Cl.uint(3),
      sender: Cl.principal(w1()),
      recipient: Cl.principal(w2()),
      memo: Cl.bufferFromHex('cafe'),
    });
    expect(
      call(LP, 'transfer-many-memo', [Cl.list([memo])], w1()).result,
    ).toEqual(Cl.ok(Cl.bool(true)));
    expect(
      errCode(
        call(
          LP,
          'transfer',
          [Cl.uint(id0), Cl.uint(1), Cl.principal(w1()), Cl.principal(w1())],
          w1(),
        ).result,
      ),
    ).toBe(2n);
    expect(
      errCode(
        call(
          LP,
          'transfer',
          [Cl.uint(id0), Cl.uint(0), Cl.principal(w1()), Cl.principal(w2())],
          w1(),
        ).result,
      ),
    ).toBe(3n);
  });

  it('metadata and transferability are governance-only', () => {
    const gov = [
      ['set-transferrable', [Cl.bool(false)]],
      [
        'set-token-base-uri',
        [Cl.some(Cl.stringAscii('https://example.org/lp/'))],
      ],
      ['notify-token-metadata-update', [Cl.list([Cl.uint(tokenId(pool, 0n))])]],
    ] as const;
    for (const [fn, args] of gov)
      expect(errCode(call(LP, fn, [...args], w1()).result)).toBe(1000n);
    for (const [fn, args] of gov)
      expect(call(LP, fn, [...args], deployer()).result).toEqual(
        Cl.ok(Cl.bool(true)),
      );
    // name and symbol are fixed
    expect(plain(ro(LP, 'get-name', [Cl.uint(1)]))).toEqual({
      ok: 'Zest CLMM LP',
    });
    expect(plain(ro(LP, 'get-symbol', [Cl.uint(1)]))).toEqual({
      ok: 'ZCLMM-LP',
    });
    const id0 = tokenId(pool, 0n);
    expect(plain(ro(LP, 'get-token-uri', [Cl.uint(id0)]))).toEqual({
      ok: `https://example.org/lp/${id0}.json`,
    });
    // non-transferable shares
    expect(
      errCode(
        call(
          LP,
          'transfer',
          [Cl.uint(id0), Cl.uint(1), Cl.principal(w1()), Cl.principal(w2())],
          w1(),
        ).result,
      ),
    ).toBe(1000n);
  });
});

describe('pool registry and configuration', () => {
  it('looks pools up by id and by key, and updates fees', () => {
    expect(plain(ro('clmm-pool-v1', 'get-pool-count'))).toBe(1n);
    const key = Cl.tuple({
      'token-x': Cl.principal(`${deployer()}.mock-token-a`),
      'token-y': Cl.principal(`${deployer()}.mock-token-b`),
      'bin-step': Cl.uint(100),
    });
    expect(plain(ro('clmm-pool-v1', 'get-pool-id', [key]))).toBe(pool.id);
    expect(
      call(
        'clmm-pool-v1',
        'update-pool-fee',
        [Cl.uint(pool.id), Cl.uint(3_000_000), Cl.uint(5_000_000), Cl.uint(0)],
        deployer(),
      ).result,
    ).toEqual(Cl.ok(Cl.bool(true)));
    const p = plain(
      ro('clmm-pool-v1', 'get-pool', [Cl.uint(pool.id)]),
    ) as Record<string, unknown>;
    expect([p['fee-rate-x'], p['fee-rate-y'], p['fee-rebate']]).toEqual([
      3_000_000n,
      5_000_000n,
      0n,
    ]);
    const fr = plain(
      ro('clmm-pool-v1', 'get-frame', [Cl.uint(100), Cl.int(0)]),
    ) as { ok: Record<string, bigint> };
    expect(fr.ok.a).toBe(2n ** 60n); // tick 0 starts at sqrt price 1
    expect(fr.ok.sx + fr.ok.sy).toBe(0n);
  });
});
