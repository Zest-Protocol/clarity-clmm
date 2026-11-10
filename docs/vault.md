# Vault

The vault runs managed liquidity for one client, in a pool of [`clmm-pool-v1`](pool.md). Two vault sources are deployed ([mainnet/README.md](../mainnet/README.md)): the test vault, `test-stx-usdcx-vault`, is the `clmm-vault-public-v1` source on public pool 1, and `zest-stx-vault-1` is the `clmm-vault-batch64-v1` source on private pool 2. The manager places the liquidity in bins. The client deposits and withdraws at any time, also when the manager or the pool is paused, and can pause the manager.

Each vault is configured once by governance.

## Roles

| Role | Can do |
|------|--------|
| **Governance** | `initialize` once, `set-manager-fee`, `set-manager`, `set-fee-recipient` |
| **Client** | `deposit`, `withdraw`, `withdraw-ticks`, `pause-manager`, `unpause-manager` |
| **Manager** | `add-liquidity`, `remove-liquidity`, `rebalance`, `harvest` |
| **Fee recipient** | Receives the manager's cut when `harvest` runs |

The client and the manager act only by calling the vault themselves (`tx-sender` = `contract-caller`), so no contract either one calls, a pool token during a deposit included, can act for it. A contract in either role calls the vault inside its own `as-contract?`. See [Who Can Hold a Role](#who-can-hold-a-role).

Neither the client nor the fee recipient, the only addresses the vault pays, may be the vault itself or the DAO (`u6009`).

## Setup

A proposal calls `initialize` with the pool, client, manager, fee recipient and manager fee. The tokens and their native-STX flags are copied from the pool's record. For `clmm-vault-v1` and `clmm-vault-batch64-v1`, the proposal first creates a private pool naming the vault as depositor; [`contracts/mocks/proposal-vault.clar`](../local-testing/contracts/mocks/proposal-vault.clar) is an example.

## Public and Private Variants

`clmm-vault-public-v1`, the deployed source, is `clmm-vault-v1` without the check in `initialize` that the pool names the vault as its depositor, so the vault LPs in a public pool beside other LPs. Nothing else in the code differs, which [`tests/vault/public-pool.test.ts`](../local-testing/tests/vault/public-pool.test.ts) pins.

- Other LPs' shares can sit in the vault's bins: they share the bins' swap fees and take their part of a deposit fee the vault pays, so only the vault's part goes to the client.
- `initialize` accepts any pool. A private pool naming another depositor would refuse the vault's adds (`u1006`).

`clmm-vault-batch64-v1` is `clmm-vault-v1` with `rebalance` taking up to 64 removals and 64 adds per call instead of 8 and 8. The vault still tracks at most 64 bins, and nothing else in the code differs, which [`tests/vault/batch64.test.ts`](../local-testing/tests/vault/batch64.test.ts) pins.

## Client Functions

```clarity
(deposit token-x token-y dx dy)
(withdraw token-x token-y percent min-dx min-dy)
(withdraw-ticks token-x token-y ticks percent min-dx min-dy)
```

- **`deposit`** pulls tokens into `idle`. The balance delta proves the vault received exactly the amounts.
- **`withdraw`** takes `percent` of the client's position from every tracked bin and from idle, in one batched pool withdrawal, and pays it to the client. At 100%, every bin is burned once and leaves the vault's books.
- **`withdraw-ticks`** does the same for listed bins only, so a large position can leave over several transactions. Idle stays.

The manager's part of what leaves a bin stays in `owed`, so an exit never pays the fee recipient and does not depend on that address. Bins whose burn rounds to zero are skipped.

Client exits take no deadline: they pay the client's share of the bins as they are when mined, with no swap, and `min-dx` and `min-dy` bound what they pay.

`pause-manager` and `unpause-manager` set a flag that blocks the manager's adds, removals and rebalances, and nothing else.

## Manager Functions

```clarity
(add-liquidity token-x token-y tick max-x max-y min-price max-price deadline)
(remove-liquidity token-x token-y tick percent deadline)
(rebalance token-x token-y removes adds deadline)
(harvest token-x token-y)
```

- **`add-liquidity`** adds from idle to a bin, at most `max-x` and `max-y`. The amounts follow the bin's token ratio at execution, and the add's deposit fee must be dust (`u6015`), so moving liquidity in and out cannot feed the protocol's share of fees.
- **`remove-liquidity`** moves `percent` of the vault's shares in a bin back to idle, less the manager's part, which goes to `owed`.
- **`rebalance`** runs removals (one batched pool withdrawal), then adds from idle, for at most 8 bins each (64 each in `clmm-vault-batch64-v1`).
- **`harvest`** burns the manager's shares in every tracked bin and pays them, with `owed`, to the fee recipient. It works while the manager is paused, since it only takes the manager's slice.

Placements take a deadline in seconds and fail with `u6020` once `stacks-block-time` is past it. `harvest` takes none: its split does not depend on when it runs.

The vault tracks at most 64 bins (`u6010`).

## Fee Cut

The manager earns `manager-fee` (φ, `1e8` units) of the growth of the client's liquidity per share. The client keeps its principal and the rest. Per bin the vault keeps `N`, the shares the client's principal would be with no manager, and `K`, that principal as liquidity. With `h` the vault's shares in the bin, `S` the bin's share supply and `L` its rounded liquidity (π = L / S):

```
client shares  c = (1 - φ) N + φ K / π
manager shares m = h - c
```

Both depend only on how much π grew, never on when anyone harvested.

- **An add** moves `N` and `K` so that the client's value grows by exactly what the vault's value grew. A deposit fee the vault pays into its own bin goes to the client.
- **A removal** pays the manager `m/h` of the tokens that leave the bin, as `owed`, and scales `N` and `K` by the shares left.
- **A harvest** burns `m` and leaves `N` and `K`, so the manager's unpaid slice keeps earning for the manager until it is harvested.

Every rounding favours the client. [`tests/vault/fee-cut.test.ts`](../local-testing/tests/vault/fee-cut.test.ts) checks the contract's cut against precomputed vectors.

`set-manager-fee` harvests at the old fee, restarts every bin's principal at the client's current value, then sets the new fee, which applies only to growth from there on.

## Token Handling

Tokens leave the vault only to the client or the fee recipient. Burns run in `as-contract?` with no allowance, so nothing the vault holds can leave during the pool call. Payouts run in a separate `as-contract?` capped at the payout.

LP shares anyone sends the vault for other bins are ignored, and shares sent for a tracked bin count as the manager's. Tokens anyone sends it are not counted, so idle plus owed may be below the vault's balance.

## Read-Only Functions

| Function | Returns |
|----------|---------|
| `get-config` | Pool, tokens, roles, fee and pause flag |
| `get-totals` | Idle, owed and tracked ticks |
| `get-principal` | A tracked bin's `N` and `K` |
| `get-position` | A tracked bin now: principal, shares and their split, and what a full withdrawal would pay each side |

## Security Features

### 1. Payouts
Tokens leave a vault only to its client or fee recipient ([Token Handling](#token-handling)).

### 2. Exits
The client can withdraw in full with the manager paused and with the pool paused or sunset. An exit never pays the fee recipient: the manager's part of what leaves a bin waits in `owed` for `harvest`.

### 3. Fee Cut
The manager gets at most φ of the growth of the client's liquidity per share, and every rounding of the cut favours the client.

### 4. Direct Calls
The client and the manager act only by calling the vault themselves, so no contract either one calls can act for it.

## Security Considerations

### Manager Trust
The manager decides where the liquidity sits, so a manager key, or a manager governance installs, can place liquidity at prices that arbitrage then takes, within one block. Pausing the manager and withdrawing protect the client against slow harm, not against a loss within one block. A paused manager stops placing, but the positions keep earning and pay the manager's fee on that growth until the client withdraws.

### Role Changes
The manager and fee recipient change by proposal (`set-manager`, `set-fee-recipient`), and neither change pays anyone. The next harvest pays the whole manager cut to the fee recipient of that moment. `set-manager-fee` restarts each bin's principal at the client's value then, even at an unchanged fee, so it is not a way to settle or waive the cut.

### Who Can Hold a Role
Each role is a wallet (standard or multisig) or a contract that calls the vault inside its own `as-contract?`. A contract that acts through other contracts, such as an ExecutorDAO-style treasury whose proposals make the calls, or a smart wallet that calls through plugins, cannot use a vault. As client it cannot even deposit.

### Moving a Client
A vault's client cannot change. To move a client to a new vault, deploy it and have the client deposit into it. For `clmm-vault-v1` in a private pool, one proposal calls `set-pool-depositor` with the new vault and then its `initialize`; the old vault can no longer place liquidity (`u1006`), so the client withdraws from it at 100%, and the manager can still remove and harvest there. A sunset pool does the same to its vault (`u1002`).
