# Error Codes

Every error constant defined by the contracts. **Codes are per contract**, and the same number can mean different things in different contracts: `u1001` is `ERR-POOL-PAUSED` in the pool and `ERR-ALREADY-EXECUTED` in `executor-dao`. Check which contract returned it.

## `clmm-pool-v1`

### Authorization and Status

| Code | Constant | Meaning |
|------|----------|---------|
| `u1000` | `ERR-NOT-AUTHORIZED` | Caller is not the DAO or an extension, or a withdrawal was not called by the owner itself |
| `u1001` | `ERR-POOL-PAUSED` | Pool is paused: no swaps, no deposits |
| `u1002` | `ERR-POOL-SUNSET` | Pool is sunset: no deposits |
| `u1003` | `ERR-POOL-NOT-FOUND` | No pool with this id |
| `u1004` | `ERR-INVALID-PAIR` | Token X and token Y are the same |
| `u1005` | `ERR-TOKEN-LISTED` | Native-STX flag cannot change once a token is listed |
| `u1006` | `ERR-NOT-DEPOSITOR` | Only a private pool's depositor adds liquidity |
| `u1007` | `ERR-PRIVATE-POOL` | Private pools refuse partner discounts |
| `u1008` | `ERR-PUBLIC-POOL` | Public pools have no depositor to move |

### Input Validation

| Code | Constant | Meaning |
|------|----------|---------|
| `u2000` | `ERR-POOL-ALREADY-EXISTS` | A public pool already exists for this pair and bin step, in either token order |
| `u2001` | `ERR-INVALID-PRICE` | Post-deposit price is outside `[min-price, max-price]` |
| `u2002` | `ERR-INVALID-TOKEN-TRAIT` | Trait is not the token the pool recorded |
| `u2003` | `ERR-INVALID-BIN-STEP` | Bin step is not 100, 500, 1000 or 2000 |
| `u2004` | `ERR-PERCENT-GREATER-THAN-ONE` | Rebate, percentage or discount is above 100% |
| `u2005` | `ERR-ZERO-PERCENT` | `reduce-position` would burn zero shares |
| `u2006` | `ERR-INVALID-AMOUNT` | Deposit of zero in both tokens |
| `u2007` | `ERR-POSITION-NOT-FOUND` | Bin has no record |
| `u2008` | `ERR-PERCENT-GREATER-THAN-OR-EQUALS-ONE` | Fee rate is 100% or more |
| `u2009` | `ERR-SLIPPAGE` | Below `min-shares`, or below a swap's or withdrawal's minimum output |
| `u2010` | `ERR-NOT-FILLED` | Route left input unspent and partial fills are off |
| `u2011` | `ERR-INVALID-ROUTE` | Route ticks are not strictly in price order |
| `u2012` | `ERR-FEE-TOO-HIGH` | A pool's fee rate is above the 10% cap |
| `u2013` | `ERR-EXPIRED` | The block time is past the swap's deadline |

### State and Math

| Code | Constant | Meaning |
|------|----------|---------|
| `u3002` | `ERR-INVALID-LP-STATE` | Deposit would mint no shares |
| `u3003` | `ERR-MAX-POOLS-ALLOWED` | Pool id space is exhausted |
| `u3004` | `ERR-TICK-OUT-OF-RANGE` | Tick is outside the bin step's table |
| `u3005` | `ERR-AMOUNT-TOO-LARGE` | Amount or reserve reaches the frame bound |
| `u3006` | `ERR-MATH-OVERFLOW` | Mul-div result does not fit, or its divisor is zero |
| `u3007` | `ERR-TRANSFER-MISMATCH` | A token moved a different amount than requested |

## `clmm-router-v1`

Pool errors other than the four mapped below pass through unchanged.

| Code | Constant | Meaning | Pool code |
|------|----------|---------|-----------|
| `u5001` | `ERR-INSUFFICIENT-LIQUIDITY` | Not filled | `u2010` |
| `u5002` | `ERR-SLIPPAGE` | Below the minimum output | `u2009` |
| `u5003` | `ERR-INVALID-ROUTE` | Bad tick order or malformed route | `u2011` |
| `u5004` | `ERR-EXPIRED` | The block time is past the swap's deadline | `u2013` |

## `clmm-lp-token-v1`

| Code | Constant | Meaning |
|------|----------|---------|
| `u1` | `ERR-INSUFFICIENT-BALANCE` | Amount exceeds the balance |
| `u2` | `ERR-SAME-PRINCIPAL` | Sender and recipient are the same |
| `u3` | `ERR-ZERO-AMOUNT` | Transfer of zero |
| `u4` | `ERR-INVALID-SENDER` | Sender is not `contract-caller`: only the owner, calling the LP token itself, moves shares |
| `u1000` | `ERR-NOT-AUTHORIZED` | Not the pool, not the DAO, or transfers are switched off |

## `clmm-vault-public-v1`

The deployed vaults (`test-stx-usdcx-vault` and `zest-stx-vault-1`), `clmm-vault-v1` and `clmm-vault-batch64-v1` use these codes.

| Code | Constant | Meaning |
|------|----------|---------|
| `u1000` | `ERR-NOT-AUTHORIZED` | Caller is not the DAO or an extension |
| `u3006` | `ERR-MATH-OVERFLOW` | Mul-div result does not fit, or its divisor is zero |
| `u6001` | `ERR-NOT-CLIENT` | Caller is not the client calling the vault itself |
| `u6002` | `ERR-NOT-MANAGER` | Caller is not the manager calling the vault itself |
| `u6003` | `ERR-MANAGER-PAUSED` | The client has paused the manager |
| `u6004` | `ERR-NOT-INITIALIZED` | The vault is not configured yet |
| `u6005` | `ERR-ALREADY-INITIALIZED` | `initialize` already ran |
| `u6006` | `ERR-NOT-DEPOSITOR` | The pool does not exist or does not name this vault as depositor (in `clmm-vault-public-v1`, only that it does not exist) |
| `u6007` | `ERR-INVALID-TOKEN` | Trait is not one of the vault's tokens |
| `u6008` | `ERR-INVALID-FEE` | Manager fee is above 100% |
| `u6009` | `ERR-INVALID-ADDRESS` | Client or fee recipient is the vault or the DAO |
| `u6010` | `ERR-TOO-MANY-BINS` | Above 64 tracked bins, or 8 bins per side of a rebalance |
| `u6011` | `ERR-NOT-HELD` | Tick is not a tracked bin |
| `u6012` | `ERR-TICK-ORDER` | Ticks are not strictly ascending |
| `u6013` | `ERR-INVALID-PERCENT` | Percent is zero or above 100% |
| `u6014` | `ERR-INVALID-AMOUNT` | Amounts are zero |
| `u6015` | `ERR-DEPOSIT-FEE` | An add's deposit fee is above dust |
| `u6016` | `ERR-VALUE-FELL` | An add lowered the value of the vault's shares |
| `u6017` | `ERR-POOL-MISMATCH` | The pool paid different amounts than the vault computed |
| `u6018` | `ERR-TRANSFER-MISMATCH` | A token moved a different amount than requested |
| `u6019` | `ERR-SLIPPAGE` | Below `min-dx` or `min-dy` |
| `u6020` | `ERR-EXPIRED` | The block time is past a placement's deadline |

## `executor-dao`

| Code | Constant | Meaning |
|------|----------|---------|
| `u1000` | `ERR-UNAUTHORISED` | Not the DAO, an extension or, for `construct`, the executive calling directly |
| `u1001` | `ERR-ALREADY-EXECUTED` | This proposal already ran |
| `u1002` | `ERR-INVALID-EXTENSION` | Caller is not the enabled extension it names |

## `operators`

| Code | Constant | Meaning |
|------|----------|---------|
| `u4000` | `ERR-NOT-AUTHORIZED` | Caller is not the DAO or an extension |
| `u4001` | `ERR-NOT-OPERATOR` | Caller is not an operator |
| `u4002` | `ERR-ALREADY-APPROVED` | This operator already approved in this epoch |
| `u4003` | `ERR-ALREADY-EXECUTED` | This proposal already executed |
| `u4004` | `ERR-EXPIRED` | The approval window has passed |
| `u4005` | `ERR-INVALID-THRESHOLD` | Threshold is zero or above the operator count |
