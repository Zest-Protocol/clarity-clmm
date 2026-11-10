# Zest CLMM - Local Testing Environment

**For Security Researchers:**
Simnet environment with every contract and example tests to help you get started. Includes the pool, router and LP token, the vault, governance, mock and hostile tokens, a proof-of-concept template and a protocol initialization reference.

## Quick Start

### Prerequisites
- [Clarinet](https://github.com/stx-labs/clarinet) 3.23 or later, for `clarinet check`
- Node.js v22+
- **pnpm** (this suite is pinned and lockfiled for pnpm)
- **Clarity**: contracts target `clarity_version = 6`, `epoch = 4.0`, as deployed on mainnet

### Setup
```bash
cd local-testing
pnpm install --frozen-lockfile
clarinet check
```

### Run Tests
```bash
pnpm test                               # Run all tests (about 2 minutes)
pnpm test --exclude '**/invariants.test.ts'   # Skip the long randomized suite
pnpm test tests/security/               # Run the template only
pnpm test tests/amm/pool.test.ts        # Run one file
pnpm test -t "first-depositor"          # Run tests matching a pattern
pnpm test:report                        # Add coverage and cost reports
pnpm typecheck                          # Type-check the tests
```

The tests call the contracts through the Clarinet SDK simulator. No Stacks node, Docker or network access is needed once dependencies are installed. The two SIP traits the contracts implement are vendored in `.cache/requirements/`.

## Your First Proof of Concept

1. Copy [`tests/security/poc-template.test.ts`](tests/security/poc-template.test.ts).
2. Set up the state you need in `beforeEach`, with the helpers in [`tests/lib/`](tests/lib/).
3. Turn the claim you are attacking into an `expect`.

Decide which bootstrap your finding needs:

| Bootstrap | Contract | Effect |
|-----------|----------|--------|
| `devnet-bootstrap` | `contracts/mocks/bootstrap.clar` | Also makes the deployer a DAO extension, so tests can list pools directly. Used by `bootstrap()` in the helpers. |
| `bootstrap` | `contracts/governance/bootstrap.clar` | Production proposal. The deployer gets no powers, and later changes go through the operators multisig. |

A finding that needs the deployer's power under the devnet bootstrap is a governance finding, not an outside attack. Rule that out with the production bootstrap, as in [`tests/governance.test.ts`](tests/governance.test.ts).

## Example Tests

Starter tests to help you build your own security tests.

### Setup Reference (1)
1. **Protocol Init** (`tests/setup/protocol-init.test.ts`) - Both bootstraps and a pool end to end

### Security Tests (5)
2. **PoC Template** (`tests/security/poc-template.test.ts`) - Start here for your own test
3. **Security Properties** (`tests/amm/security.test.ts`) - Dust extraction, first-depositor inflation, tick range, and a hostile token against the asset allowances
4. **Post-Conditions** (`tests/amm/postconditions.test.ts`) - Wallet-level safety in deny mode
5. **Governance Controls** (`tests/governance-controls.test.ts`) - The production bootstrap cannot be replayed and gives the deployer no powers
6. **Production Governance** (`tests/governance.test.ts`) - Bootstrap, then proposals through the multisig

### Randomized Invariants (1)
7. **Pool Invariants** (`tests/amm/invariants.test.ts`) - Token conservation, share accounting, prices stay in their bins, after every operation

### Pool Flows (6)
8. **Pool** (`tests/amm/pool.test.ts`) - Pool lifecycle: listing, deposits, swaps, withdrawals, fees
9. **Router** (`tests/amm/router.test.ts`) - Multi-bin swaps, multi-pool routes, fill-or-kill, batching
10. **Liquidity Token** (`tests/amm/liquidity-token.test.ts`) - SIP-013 shares and transfers
11. **Private Pools** (`tests/amm/private-pools.test.ts`) - The depositor gate, through the pool and the router
12. **Fee Discounts** (`tests/amm/fee-discounts.test.ts`) - Partner discounts on swaps, routes and deposits
13. **Batched Withdrawal** (`tests/amm/batched-withdrawal.test.ts`) - `reduce-positions` against the per-bin path

### Vault (5)
14. **Roles** (`tests/vault/roles.test.ts`) - What governance, the client and the manager can each do
15. **Exits** (`tests/vault/exits.test.ts`) - Client withdrawals with the manager or the pool paused or sunset, and the 64-bin cap
16. **Hostile Tokens** (`tests/vault/hostile.test.ts`) - Hostile tokens and unsolicited transfers against the vault
17. **Fee Cut** (`tests/vault/fee-cut.test.ts`) - The contract's fee cut against precomputed vectors, on `tests/vectors/vault-fee.json`
18. **Public Pool** (`tests/vault/public-pool.test.ts`) - `clmm-vault-public-v1` (the deployed vault) beside outside LPs, and that only the depositor check differs from `clmm-vault-v1`

### Math (3)
19. **Vectors** (`tests/amm/vectors.test.ts`) - Contract read-only math against precomputed vectors, bit for bit, on `tests/vectors/pool-math.json`
20. **Mul-Div Boundaries** (`tests/amm/mul-div-boundaries.test.ts`) - Boundary inputs of the 256-bit mul-div
21. **Route Equivalence** (`tests/amm/route-equivalence.test.ts`) - Pool-native routes against a per-bin reference router on identical pools

Use these as a base to develop comprehensive test suites for your security research.

## Simnet Setup

| Path | Contents |
|------|----------|
| `contracts/` | The contracts with their comments. Without comments, each deployed one is the same Clarity code as its deployed source in [`../mainnet/contracts/`](../mainnet/contracts/); the deployed vaults are `clmm-vault-public-v1` and `clmm-vault-batch64-v1`. `clmm-vault-v1` is not deployed |
| `contracts/governance/` | `executor-dao`, `operators`, production `bootstrap`, traits |
| `contracts/mocks/` | Test only: devnet bootstrap, test proposals, tokens, the per-bin reference router |
| `tests/lib/` | Helpers: `protocol.ts` (pool), `vault.ts` (vault), `clarity.ts` (value decoding) |
| `settings/Devnet.toml` | Clarinet's standard public test accounts. Never use these keys anywhere else |
| `deployments/default.simnet-plan.yaml` | Simnet deployment plan |

Mock tokens:

| Contract | Notes |
|----------|-------|
| `mock-token-a`, `mock-token-b`, `mock-token-c` | Standard SIP-010 tokens |
| `mock-token-stx` | SIP-010 wrapper that moves native STX |
| `mock-token-evil` | Hostile SIP-010 token. Modes: honest (`u0`), moves twice the amount (`u1`), moves another token too (`u2`), delivers half (`u3`), delivers half to or from one target (`u4`, `u5`), refuses transfers to one target (`u6`) |
| `mock-token-lp-thief` | Hostile SIP-010 token that tries to move a victim's LP shares during `get-balance` or `transfer` |

## Architecture

See [../docs/High-Level-Overview.md](../docs/High-Level-Overview.md) for the complete architecture.

**Key contracts:**
- `clmm-pool-v1.clar` - Pools, bins, swaps, positions, fees, custody
- `clmm-router-v1.clar` - Stateless routing and batching
- `clmm-lp-token-v1.clar` - SIP-013 liquidity shares
- `clmm-vault-public-v1.clar` - Managed liquidity for one client in a public pool (deployed as `test-stx-usdcx-vault`)
- `clmm-vault-v1.clar` - The same vault for a private pool (not deployed)
- `clmm-vault-batch64-v1.clar` - `clmm-vault-v1` with 64-item `rebalance` lists (deployed as `zest-stx-vault-1`)
- `governance/*` - ExecutorDAO, operators multisig, bootstrap

## Documentation

- [Architecture Overview](../docs/High-Level-Overview.md)
- [Pool System](../docs/pool.md)
- [Router](../docs/router.md)
- [Vault](../docs/vault.md)
- [DAO System](../docs/dao.md)
- [Error Codes](../docs/errors.md)

## Security Audits

Zest CLMM has been audited by [Clarity Alliance](https://x.com/ClarAllianceSec). See the [main README](../README.md#security-audits) for the report.

## Mainnet Deployment

Deployment status: [../mainnet/README.md](../mainnet/README.md)

## Bug Bounty

**Bug bounty program on Immunefi:** https://immunefi.com/bug-bounty/zest-protocol-v2/information/ (the contracts listed in [../mainnet/README.md](../mainnet/README.md) will be added to its scope)

For direct disclosure: security@zestprotocol.com
