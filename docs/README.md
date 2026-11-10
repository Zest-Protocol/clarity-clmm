# Zest CLMM Documentation

The [Zest CLMM whitepaper](https://docs.zestprotocol.com/whitepapers/zest-clmm-whitepaper.pdf) specifies the bin model, the deposit fee and the integer implementation, with proofs.

## Core Components

### Pool System
Discrete-bin concentrated liquidity, with custody of LP funds in one contract:
- Bins with a constant-product curve inside, derived entirely from reserves
- Deposits with any token ratio, where the implicit swap pays the swap fee
- Proportional withdrawals that work in paused and sunset pools
- Private pools and partner fee discounts
- SIP-013 liquidity shares, one token id per bin, moved or redeemed only by their owner

[Learn more about the Pool →](pool.md)

### Router
Stateless batching and routing on top of the pool:
- Multi-bin swaps with minimum outputs and fill-or-kill
- Multi-pool routes of up to nine hops
- Batched deposits
- A minimum output and a deadline on every swap

> **Note:** Every router call executes as the transaction sender, and the multi-bin walk itself runs inside the pool.

[Learn more about the Router →](router.md)

### Vault
Managed liquidity for one client, in a pool of the CLMM. The deployed vaults are the test vault on public pool 1 and `zest-stx-vault-1` on private pool 2:
- A manager places the liquidity, and earns a share of its growth
- The client deposits, withdraws and can pause the manager at any time
- The client's principal and the manager's cut are tracked per bin

[Learn more about the Vault →](vault.md)

### DAO System
Protocol governance:
- ExecutorDAO core with an extension registry
- m-of-n `operators` multisig with expiring approvals

[Learn more about the DAO →](dao.md)

### Error Codes
Complete reference of error codes by contract:

[Learn more about Error Codes →](errors.md)

## Protocol Architecture

```
                 ┌───────────────────────────────┐
                 │  clmm-pool-v1                 │
                 │  Bins, swaps, positions       │
 clmm-router-v1 ►│  Fees, private pools          │
                 │  Custody of LP funds          │
                 └───────────────┬───────────────┘
                                 ▼
                 ┌───────────────────────────────┐
                 │  clmm-lp-token-v1 (SIP-013)   │
                 └───────────────────────────────┘

                 ┌───────────────────────────────┐
                 │  vault, one per client        │
                 │  LP in a pool of clmm-pool-v1 │
                 └───────────────────────────────┘

                 ┌───────────────────────────────┐
                 │  executor-dao  ◄── operators  │
                 └───────────────────────────────┘
```

## Getting Started

1. **[High-Level Overview](High-Level-Overview.md)** - Start with the architectural overview
2. **[Pool](pool.md)** - How bins, positions and swaps work
3. **[Router](router.md)** - How trades cross bins and pools
4. **[Vault](vault.md)** - Managed liquidity
5. **[DAO](dao.md)** - Who can change what

## Smart Contract Language

All contracts are written in **Clarity 6** and target **Epoch 4.0**, as deployed on mainnet. Clarity is a decidable, interpreted smart contract language with no reentrancy. It adds two features this protocol relies on throughout: `as-contract?` and `restrict-assets?` bound exactly which assets a call may move.

## Additional Resources

- [Clarity Language Documentation](https://docs.stacks.co/clarity)
- [SIP-010: Fungible Token Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md)
- [SIP-013: Semi-Fungible Token Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-013/sip-013-semi-fungible-token-standard.md)
- [SIP-033: Clarity 4](https://github.com/stacksgov/sips/blob/main/sips/sip-033/sip-033-clarity4.md)
