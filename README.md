# <img src="logo.svg" alt="" width="32" height="32" valign="middle" /> Zest CLMM

Zest CLMM is a **discrete-bin concentrated-liquidity market maker** for Stacks. It ships with a **managed-liquidity vault** that runs one client's liquidity in a pool. Both are written in Clarity 6 (Epoch 4.0) and use **ExecutorDAO governance** with an m-of-n operators multisig.

The bin model, the deposit fee and the integer implementation are specified, with proofs, in the **[Zest CLMM whitepaper](https://docs.zestprotocol.com/whitepapers/zest-clmm-whitepaper.pdf)**.

### 🌐 mainnet/
Deployment information, including:
- Contract addresses on Stacks mainnet
- Explorer links
- The deployed source of each contract

**[View Mainnet Deployment →](mainnet/README.md)**

### 🧪 local-testing/
**For Security Researchers:**
- 22 example test files to get you started (pool flows, router, vault, governance, hostile tokens, randomized invariants, bit-exact math vectors)
- A proof-of-concept template and a protocol initialization reference
- Complete simnet setup with every contract, mock token and test proposal

**[Security Researchers: Get Started →](local-testing/README.md)**

## Security Audits

Zest CLMM has been audited by:
- [**Clarity Alliance**](https://x.com/ClarAllianceSec) - Leading Clarity security firm

### Audit Reports

- [**Clarity Alliance - Zest Protocol CLMM Security Review**](https://clarity-alliance.github.io/audits/Clarity%20Alliance%20-%20Zest%20Protocol%20CLMM.pdf), 2 November 2026

## Bug Bounty

**Bug bounty program on Immunefi:** https://immunefi.com/bug-bounty/zest-protocol-v2/information/

The contracts listed in [mainnet/README.md](mainnet/README.md) will be added to the program's scope.

For direct disclosure: security@zestprotocol.com

## Key Features

- **Bins with a real curve inside**: Each bin is a concentrated-liquidity range with a constant-product curve, so a trade can move the price within a bin and not only across bins
- **State is just the reserves**: Liquidity and price are derived from a bin's reserves, so every state is valid and the price cannot leave its bin
- **Fair deposits**: The swap a deposit implicitly performs pays the swap fee, so that depositing and then withdrawing cannot beat swapping at the same fee rate. Property fuzzing has found no round trip that does; it is not proven
- **Exits stay open**: Pool withdrawals work in paused and sunset pools
- **Owner-only shares**: LP shares move or redeem only when their owner calls the contract itself, so no contract a user calls can take them
- **Contained tokens**: Every call into a token runs inside an exact Clarity 4 asset guard, and every transfer checks balance deltas, so non-standard tokens fail closed
- **Bounded fees and timing**: Pool rates are capped at 10%, and every swap takes a minimum output and a deadline
- **Private pools and managed vaults**: A pool can name one depositor, such as a vault that keeps a client's principal separate from the manager's cut

## Architecture

```
       LPs and traders
              │
     ┌────────┴─────────┐
     ▼                  ▼
┌──────────────┐  ┌──────────────┐
│clmm-router-v1│─►│ clmm-pool-v1 │
│              │  │              │
│ routes,      │  │ bins, swaps, │
│ batches,     │  │ fees, custody│
│ stateless    │  │              │
└──────────────┘  └──┬────────▲──┘
                     ▼        │
              ┌──────────┐ ┌──┴───────┐
              │clmm-lp-  │ │clmm-vault│
              │token-v1  │ │per client│
              │(SIP-013) │ │          │
              └──────────┘ └──────────┘

      ┌───────────────────────────────────────────────────────┐
      │ executor-dao  ◄──  operators (m-of-n multisig)        │
      │ lists pools, sets fees and status                     │
      └───────────────────────────────────────────────────────┘
```

## Core Components

| Contract | Purpose |
|----------|---------|
| `clmm-pool-v1.clar` | Pools, bins, swaps, positions, fees and custody of LP funds |
| `clmm-router-v1.clar` | Stateless routing and batching: multi-bin swaps, multi-pool routes, fill-or-kill, batched deposits |
| `clmm-lp-token-v1.clar` | SIP-013 liquidity shares, one token id per bin, minted and burned only by the pool |
| `clmm-vault-public-v1.clar` | Managed liquidity for one client in a public pool, beside other LPs, one deployment per client. Deployed as `test-stx-usdcx-vault` |
| `clmm-vault-v1.clar` | The same vault for a private pool that names it as the only depositor. Not deployed |
| `clmm-vault-batch64-v1.clar` | `clmm-vault-v1` with `rebalance` taking up to 64 removals and 64 adds per call instead of 8 and 8. Deployed as `zest-stx-vault-1` on pool 2 |
| `executor-dao.clar` | Proposal execution and the extension registry |
| `operators.clar` | m-of-n multisig that approves proposals |

## How a Bin Works

Each pool splits the price axis into bins of a fixed step (1%, 5%, 10% or 20%). Bin `tick` covers prices `[(1+step)^tick, (1+step)^(tick+1)]`, quoted as raw X per raw Y. Inside a bin:

```
(x + L·√P_start)(y + L/√P_end) = L²
```

- **Numerics**: Q60 pseudo-float tick prices, an exact 256-bit mul-div, and pool-favouring rounding with a proven error margin
- **Trades**: Every trade strictly increases its bin's exact liquidity, never passes the trader's price limit, and charges at most the exact curve cost plus a 2⁻⁴⁰ haircut and rounding
- **Shares**: Withdrawals are proportional, one bin at a time or up to 64 bins in one call. The first deposit into a bin locks 1,000 shares forever

## Documentation

Full documentation is available in the [docs/](docs/) directory:

| Document | Description |
|----------|-------------|
| [Architecture Overview](docs/High-Level-Overview.md) | High-level system design |
| [Pool System](docs/pool.md) | Bins, positions, swaps, fees, private pools, LP shares |
| [Router](docs/router.md) | Multi-bin swaps, multi-pool routes, batching |
| [Vault](docs/vault.md) | Managed liquidity, roles and the fee cut |
| [DAO System](docs/dao.md) | Governance, operators multisig, proposal lifecycle |
| [Error Codes](docs/errors.md) | Complete error code reference |
| [Whitepaper](https://docs.zestprotocol.com/whitepapers/zest-clmm-whitepaper.pdf) | The bin model, the deposit fee and the integer implementation, with proofs |

For testing documentation, see [local-testing/README.md](local-testing/README.md).

## Repository Layout

```
docs/            protocol documentation
mainnet/         deployed contracts and explorer links
local-testing/   simnet environment: contracts, mocks, tests
```

## License

Licensed under the [Business Source License 1.1](LICENSE). You can read, copy, modify and test this code, and build security tooling with it. Deploying it, or a derivative, to offer a financial service is not permitted until the Change Date in the license, when it becomes available under GPL-2.0-or-later. See also [NOTICE](NOTICE).
