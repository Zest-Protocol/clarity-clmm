# Zest CLMM - Mainnet Deployment

Deployment of Zest CLMM on Stacks mainnet.

## Deployed Contracts

| Contract Name | Explorer Link | Last Updated |
|--------------|---------------|--------------|
| [proposal-trait](contracts/governance/proposal-trait.clar) | [Link](https://explorer.hiro.so/txid/0xf2aecc161c03edea4683a5712f5016e5a5e3862051160ffc3a93fe4975557834?chain=mainnet) | 4th Nov 2026 |
| [extension-trait](contracts/governance/extension-trait.clar) | [Link](https://explorer.hiro.so/txid/0x48375cea11bd5f93f6466e14ea1a49018cdeddcde4374b304deaa684b0acd894?chain=mainnet) | 4th Nov 2026 |
| [executor-dao](contracts/governance/executor-dao.clar) | [Link](https://explorer.hiro.so/txid/0xf1fe045dab2e46504c1192c2760f57c11316f63719509ae5c5241532beae5ce4?chain=mainnet) | 4th Nov 2026 |
| [operators](contracts/governance/operators.clar) | [Link](https://explorer.hiro.so/txid/0xacba55cfa27b681816d3922e88ba40241db976df5237a352088e1ce4a6e78f98?chain=mainnet) | 4th Nov 2026 |
| [clmm-lp-token-v1](contracts/clmm/clmm-lp-token-v1.clar) | [Link](https://explorer.hiro.so/txid/0xca7b91492ffc1dddad71bb2ca386c9cf322540a8fad2106a7f53ed14da8d38e6?chain=mainnet) | 4th Nov 2026 |
| [clmm-pool-v1](contracts/clmm/clmm-pool-v1.clar) | [Link](https://explorer.hiro.so/txid/0x375aff47712dd411bd5c4939f68bf75fc6dc233da93d85493a4e438db8c1a908?chain=mainnet) | 4th Nov 2026 |
| [clmm-router-v1](contracts/clmm/clmm-router-v1.clar) | [Link](https://explorer.hiro.so/txid/0x8ca2f39e9aecbce878e1fb986623947aadec9057ab235a3480469266282fa077?chain=mainnet) | 4th Nov 2026 |

### Test Vault

A managed-liquidity vault on pool 1, deployed from the `clmm-vault-public-v1` source under its own name. Every vault deployed from that source is the same code.

| Contract Name | Explorer Link | Last Updated |
|--------------|---------------|--------------|
| [test-stx-usdcx-vault](contracts/vault/test-stx-usdcx-vault.clar) | [Link](https://explorer.hiro.so/txid/0x50b049770d872376ffaa9e68a05a18fdd9b821c614979fa4e2484afb6595a009?chain=mainnet) | 4th Nov 2026 |

### ZEST/STX Vault

The vault on pool 2, deployed from the `clmm-vault-batch64-v1` source: `clmm-vault-v1` with `rebalance` taking up to 64 removals and 64 adds per call instead of 8 and 8. It still tracks at most 64 bins.

| Contract Name | Explorer Link | Last Updated |
|--------------|---------------|--------------|
| [zest-stx-vault-1](contracts/vault/zest-stx-vault-1.clar) | [Link](https://explorer.hiro.so/txid/0x67333079ff4b978275e191ffa9d14c07d7e3f1e2e0365038c62464c80ae030c0?chain=mainnet) | 10th Nov 2026 |

## Deployment Details

- **Network**: Stacks Mainnet
- **Deployer**: `SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST`
- **Clarity**: version 6, Epoch 4.0
- **Pool 1**:
  - Pair: STX (`SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx`) / USDCx (`SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx`)
  - Bin step: 1%
  - Fee: 0.30% in each direction, 80% of it to LPs
  - Public
- **Pool 2**:
  - Pair: ZEST (`SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.zest-token`) / STX (`SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx`)
  - Bin step: 1%
  - Fee: 1% in each direction, all of it to LPs
  - Private: only `zest-stx-vault-1` can add liquidity; anyone can swap
- **Governance**: the `operators` multisig, at 2 of 3, so every proposal needs two approvals. It is the DAO's only extension.

The files in [contracts/](contracts/) are the deployed source, byte for byte. The same code with its comments is in [local-testing/contracts/](../local-testing/contracts/). Removing the comments gives the same Clarity tokens as the deployed source, and that copy is what the tests run.

## Security Audits

Zest CLMM has been audited by:
- [**Clarity Alliance**](https://x.com/ClarAllianceSec) - Leading Clarity security firm

### Audit Reports

- [**Clarity Alliance - Zest Protocol CLMM Security Review**](https://clarity-alliance.github.io/audits/Clarity%20Alliance%20-%20Zest%20Protocol%20CLMM.pdf), 2 November 2026

## Bug Bounty & Security Research

For the local testing environment [click here](../local-testing/README.md) to get started.

**Bug bounty program on Immunefi:** https://immunefi.com/bug-bounty/zest-protocol-v2/information/ (the contracts listed above will be added to its scope)

For direct disclosure: security@zestprotocol.com
