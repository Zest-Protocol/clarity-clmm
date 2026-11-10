# Zest CLMM Architecture Overview

This document gives a high-level breakdown of how Zest CLMM operates on the Stacks blockchain.

## 1. High-Level Architecture

The repository contains:

- **Zest CLMM**: LPs deposit into price bins, and traders swap against those bins
- **Zest CLMM vault**: A manager places one client's liquidity in a pool. The deployed vaults are the test vault on public pool 1 and `zest-stx-vault-1` on private pool 2
- **Governance**: An ExecutorDAO with an m-of-n multisig lists pools and sets fees

## 2. Core Components

### The Pool (`contracts/clmm-pool-v1.clar`)
The core of the CLMM. It holds all LP funds and protocol fees.

**Responsibilities:**
- **Bins:** Stores each bin's reserves, share supply and cached geometry
- **Positions:** `add-to-position`, `reduce-position` and the batched `reduce-positions`
- **Swaps:** Single-bin immediate-or-cancel swaps and multi-bin routes
- **Fees:** Splits each fee between the bin's LPs and the protocol
- **Math:** Tick prices, the liquidity solve and an exact 256-bit mul-div

### The Router (`contracts/clmm-router-v1.clar`)
Holds no state and no funds. It batches pool calls, adds fill-or-kill, and chains pools into multi-hop routes. Every call runs as the transaction sender.

### The LP Token (`contracts/clmm-lp-token-v1.clar`)
SIP-013 semi-fungible shares, with one token id per bin:

```
token-id = pool-id * 2^64 + (tick + 2^32)
```

Only the pool can mint or burn, so a bin's share supply always matches its recorded supply. Shares move or redeem only when their owner calls the LP token or the pool itself, so no contract a user calls can take them.

### The Vault (`contracts/clmm-vault-public-v1.clar`)
Managed liquidity for one client, deployed once per client. On mainnet it is the test vault `test-stx-usdcx-vault`, on public pool 1, beside other LPs. A manager places the liquidity and earns a share of its growth. The client deposits and withdraws at any time. `clmm-vault-v1` is the same code for a private pool that names the vault as its only depositor; it is not deployed itself. `clmm-vault-batch64-v1`, `clmm-vault-v1` with longer `rebalance` lists, runs as `zest-stx-vault-1` on private pool 2. See [vault.md](vault.md).

### Governance (`contracts/governance/`)
`executor-dao` runs proposals and keeps the list of enabled extensions. `operators`, the DAO's only extension on mainnet, is an m-of-n multisig: the approval that reaches the threshold executes the proposal through the DAO.

## 3. Key Workflows

### Providing Liquidity
1. An LP calls `add-to-position` with amounts of each token, a bin, a price band and a minimum share count.
2. The pool computes the bin's liquidity before and after. The swap the deposit implicitly performs pays the swap fee.
3. The pool pulls the tokens, updates the bin and mints shares. The first deposit into a bin locks 1,000 shares in the pool forever.

### Swapping
1. A trader calls the router (or the pool) with an input amount, a list of ticks in price order, a price limit, a minimum output and a deadline.
2. For each bin, the pool accepts as much input as fits before the limit, the bin's output runs out, or its reserve reaches the frame bound.
3. The pool credits the LP share of the fee to the bin, accrues the rest to the protocol, then transfers the totals once each way.

### Withdrawing
1. An LP calls `reduce-position` with a percentage of their shares in a bin.
2. The pool burns the shares and pays the proportional reserves. This works in paused and sunset pools. The owner must call the pool itself.

## 4. Security Features

- **Asset Allowances:** Payouts run in `as-contract?` with an exact `with-ft` or `with-stx` allowance, and pulls run in `restrict-assets?` on the trader. Every call into a token, balance reads included, runs inside one of these guards, so a misbehaving token cannot move any other asset of the pool or the user.
- **Delivery Checks:** Every pull and payout checks balance deltas, so under-delivering tokens fail closed (`u3007` in the pool, `u6018` in the vault).
- **Exits:** Withdrawals work in paused and sunset pools, and a vault client can withdraw in full with the manager paused. A token's native-STX flag is fixed once it is listed, so the payout path of a token holding funds cannot change.
- **Considerations:** Each component's page lists what it assumes: [pool](pool.md#security-considerations), [vault](vault.md#security-considerations), [DAO](dao.md#security-considerations).
