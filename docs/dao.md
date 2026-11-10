# DAO System

Governance is an ExecutorDAO with an m-of-n multisig. The contracts are in [`local-testing/contracts/governance/`](../local-testing/contracts/governance/).

## Authorization

Protocol contracts authorise governance calls with one check:

```clarity
(or (is-eq tx-sender .executor-dao)
    (contract-call? .executor-dao is-extension contract-caller))
```

So there are two ways in: a proposal running as the DAO, or a direct call from an enabled extension.

The pool is not an extension, because it needs no DAO authority. The LP token accepts mint and burn from the pool itself.

## Contracts

### `executor-dao`

| Function | Purpose |
|----------|---------|
| `construct` | One-time setup. The deployer, calling directly, hands the DAO to itself by executing a proposal |
| `execute` | Runs a proposal once. DAO or extension only |
| `set-extension`, `set-extensions` | Enable or disable extensions. DAO or extension only |
| `request-extension-callback` | Lets an extension call itself back through the DAO |
| `is-extension`, `executed-at` | Read-only state |

Proposals run with the DAO's unrestricted asset allowance (`with-all-assets-unsafe`). They are trusted by definition, since only the DAO or an extension can execute them. Each proposal contract can run once (`u1001`).

### `operators`

An m-of-n multisig extension.

| Function | Purpose |
|----------|---------|
| `approve` | Records an operator's approval. The approval that reaches the threshold executes the proposal |
| `set-operator`, `set-threshold` | Change the signer set. DAO or extension only |
| `is-operator`, `get-threshold`, `get-operator-count`, `get-proposal`, `get-epoch` | Read-only state |

- **Expiry:** Approvals expire after `APPROVAL-WINDOW` (241,920 blocks, about two weeks at 5 seconds per block). Stacks block times vary, so the real length differs.
- **Epochs:** Any change to the signer set or threshold starts a new epoch that voids every pending approval. A removed operator's vote can never count.
- **Signer keys:** An approval counts the transaction sender, so signer keys are used only to call `approve`.

On mainnet `operators` is the DAO's only extension, and the multisig is 2-of-3 ([mainnet/README.md](../mainnet/README.md)).

## Proposal Lifecycle

1. **Deploy** a contract implementing `proposal-trait`.
2. **Approve:** Operators call `(contract-call? .operators approve .my-proposal)`.
3. **Execute:** The approval that reaches the threshold runs it through `executor-dao`, in the same transaction.

Every change takes effect when executed.

[`local-testing/tests/governance.test.ts`](../local-testing/tests/governance.test.ts) walks this whole flow, and [`contracts/mocks/proposal-list-pool.clar`](../local-testing/contracts/mocks/proposal-list-pool.clar) is an example proposal.

## What Governance Can Do

**Pool:** Create public and private pools, move a private pool's depositor, set fee rates up to 10%, pause and sunset, register native-STX wrappers before listing, set partner discounts, and claim protocol fees.

**LP token:** Switch share transfers on or off, set the base URI, and send metadata update notices. The name and symbol are fixed.

**Vault:** Configure a vault once, change its manager fee, manager and fee recipient.

**Governance itself:** Enable extensions and change the signer set. Every enabled extension can act as the DAO, so an extension can run any proposal or enable more extensions without the operators. Review of every enabled extension is part of the trust model.

## What Governance Cannot Do

- **Touch LP funds.** It cannot create, destroy or redeem LP shares, or withdraw AMM liquidity. Shares are minted and burned only by the pool, and redeemed only for an owner that calls the pool itself.
- **Block exits.** `reduce-position` and `reduce-positions` do not depend on status or extension membership. A vault client's withdrawals work with the manager or the pool paused.
- **Act as a vault's client or manager.** A vault's roles act only by calling it themselves, so a proposal cannot stand in for them.
- **Change a listed token's native-STX flag.** It is fixed at listing, so governance cannot redirect the allowances of a token that holds funds.

## Security Considerations

### Immediate Effect
Every change takes effect in the block it is executed, with no delay. Clients protect a pending trade with a minimum output, and the 10% cap bounds what a fee change can take from it ([pool.md](pool.md#fee-changes)).

### Extensions Act as the DAO
Every enabled extension can run any proposal or enable more extensions without the operators, as in the standard ExecutorDAO. On mainnet `operators` is the only one.

### Approvals
An approval counts the transaction sender, so signer keys are used only to call `approve`. Any change to the signer set or threshold voids every pending approval. `APPROVAL-WINDOW` is counted in blocks, so its real length follows Stacks block times.

### Keeping an Executor
Only an enabled extension can run a proposal, and on mainnet `operators` is the only one. Disabling the last enabled extension would leave no way to run proposals.

### Treasury
`claim-fees` pays protocol fees to the recipient a proposal names. A proposal runs with the DAO's full authority, and a token the DAO itself moves runs as the DAO, so the DAO holding listed tokens or LP shares would give those tokens that authority.

## Upgrades

The contracts have no proxy and no upgrade hook. Their names are fixed in each other's code: the pool calls `.clmm-lp-token-v1`, the LP token accepts only `.clmm-pool-v1`, and the router calls `.clmm-pool-v1`. A v2 is a new set of contracts. Governance retires v1 by setting its pools to sunset: new deposits stop and withdrawals keep working. LPs move in two transactions of their own, withdrawing from v1 with `reduce-positions` and adding to v2. The 1,000 shares each bin locked on its first deposit stay in v1.

## Devnet Bootstrap

[`contracts/mocks/bootstrap.clar`](../local-testing/contracts/mocks/bootstrap.clar) makes the deployer an extension, so tests can call governance functions directly. It must never reach mainnet.
