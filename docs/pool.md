# Pool System

`clmm-pool-v1` is the core of Zest CLMM: pools, bins, swaps, positions, fees and custody of LP funds. `clmm-lp-token-v1` holds the shares.

## Pools and Bins

A pool is a token pair (X, Y) with a bin step and fee settings. A pair has at most one public pool per bin step, whichever token is X (`u2000`). Bin `tick` covers prices `[(1+β)^tick, (1+β)^(tick+1)]`, quoted as **raw X per raw Y**.

| Bin step (`bin-step`) | β | Largest tick (±) |
|-----------------------|-----|------------------|
| `u100` | 1% | 4,458 |
| `u500` | 5% | 909 |
| `u1000` | 10% | 465 |
| `u2000` | 20% | 243 |

Inside a bin the pool is a virtual-reserve curve:

```
(x + L·a)(y + L/b) = L²     a = √(start price), b = √(end price)
```

A bin's state is just its reserves. Liquidity `L` and the price are derived from them, so every non-empty pair of reserves is a valid state and its price lies in the bin.

Bins are independent. Nothing connects them, and there is no active-bin pointer: liquidity away from the market price is arbitraged like a resting limit order.

## Positions

### Adding: `add-to-position`

```clarity
(add-to-position token-x token-y pool-id tick dx dy min-price max-price min-shares)
```

Adds `(dx, dy)` to a bin in any ratio.

- **First deposit into a bin:** Pays no fee. Mints `L - 1000` shares and locks 1,000 more in the pool forever.
- **Later deposits:** The swap the deposit implicitly performs pays the swap fee, so that depositing and then withdrawing cannot beat swapping at the same fee rate. Property fuzzing has found no round trip that does; it is not proven. The LP share of that fee is credited to existing holders before new shares are minted.
- **Slippage:** Reverts with `u2009` below `min-shares`, and with `u2001` unless the post-fee price is enclosed by `[min-price, max-price]` (WAD).

Reverts with `u1001` when paused, `u1002` when sunset and `u1006` for anyone but the depositor of a private pool. Deposits take no deadline: `min-shares` and the price band bound them.

### Removing: `reduce-position` and `reduce-positions`

```clarity
(reduce-position token-x token-y pool-id tick percent min-dx min-dy)
(reduce-positions token-x token-y pool-id items min-dx min-dy)
```

Burns `percent` (`1e8` = 100%) of the caller's shares and pays the proportional reserves. Both work in paused and sunset pools.

Shares are redeemed only for an owner that calls the pool itself (`tx-sender` = `contract-caller`, or `u1000`), so a contract the owner calls, a listed token included, cannot redeem them. A contract redeems its own shares inside `as-contract?`.

`reduce-positions` is the batched form: up to 64 bins, paying the totals once per token. A bin whose burn rounds to zero is skipped, so one dust position cannot block the rest. `reduce-position` reverts with `u2005` in the same situation. The reported `shares` total stops at `2^128 - 1`, and each bin's event has its exact burn.

A burn whose payouts both round to zero still burns its shares, which were worth under one raw unit of each token. Clients quote each bin and leave such a bin out.

## Swaps

Every swap takes a minimum output and a `deadline` in seconds, a Unix time compared with `stacks-block-time`. A swap mined after its deadline fails with `u2013`.

### Single Bin: `swap-x-for-y-ioc` and `swap-y-for-x-ioc`

```clarity
(swap-x-for-y-ioc token-x token-y pool-id tick dx max-price min-dy deadline)
(swap-y-for-x-ioc token-x token-y pool-id tick dy min-price min-dx deadline)
```

Immediate-or-cancel inside one bin. A swap spends as much input as fits before the bin price reaches the trader's limit, the bin's output runs out, or its input reserve reaches the frame bound. It fails with `u2009` below the minimum output. With a minimum of zero and no output, the call succeeds with zeros and moves nothing.

The price limit bounds the curve price, not the fee taken from the input, so clients set the minimum from a fresh quote.

### Multi-Bin: `swap-x-for-y-route` and `swap-y-for-x-route`

Applies the single-bin swap to up to 32 listed bins in turn, with one `deadline` for the route. Ticks must be strictly ascending for X→Y and strictly descending for Y→X (`u2011`). `min-dy` / `min-dx` bound the total output (`u2009`), and `allow-partial-fill` decides whether unspent input is allowed (`u2010`).

Each bin's state, fee and LP credit equal those of calling `swap-*-ioc` bin by bin with the input that is left. A route shares one pool load, one pause and token check, one fee write, one event and one token transfer each way. The pause, deadline, token and amount checks run before the first bin, so a route on a paused pool fails even with no input to spend.

### Output Calculation

Price targets only decide how much input is accepted. The output is the constant-product amount for that input, computed from conservative virtual reserves and then haircut by `2⁻⁴⁰` and one frame unit. It never exceeds the exact output, and a bin's exact liquidity strictly grows with every trade.

## Fees

Fee rates and the rebate are in `1e8` units.

| Field | Meaning |
|-------|---------|
| `fee-rate-x`, `fee-rate-y` | Fee on input in that token. At most 10% (`u2012`) |
| `fee-rebate` | Share of the fee credited to the bin's LPs. At most 100% |

The fee is rounded up on the gross input. The LP share compounds into the bin, and the rest accrues per pool in `pool-fees` until governance calls `claim-fees`. Protocol fees are not part of the reserves backing shares.

### Partner Discounts

`set-fee-discount` gives an address a percentage off a public pool's fees on its swaps, routes and deposits. The discounted rate is rounded up, so it never exceeds the pool's rate and reaches zero only at a 100% discount. The pool's `discounts` counter decides whether the map is read at all.

Discounts are keyed on `tx-sender`, and private pools refuse them (`u1007`).

## Private Pools

`create-private-pool` lists a pool with one `depositor`, the only address `add-to-position` accepts. Anyone trades against it, and anyone holding its shares withdraws.

- **Not indexed:** Private pools are not in `pool-id-by-token`, so they sit beside the public pool of the same key. Indexers find them by the `create-private-pool` event.
- **Moving the depositor:** `set-pool-depositor` moves a private pool to a new depositor and refuses public pools (`u1008`). The old depositor keeps its shares and can still withdraw them.
- **Intended use:** A reviewed managed-liquidity vault contract, such as [`clmm-vault-v1`](vault.md).

## LP Shares

`clmm-lp-token-v1` is SIP-013 with one token id per bin:

```
token-id = pool-id * 2^64 + (tick + 2^32)
```

- **Mint and burn:** Only `.clmm-pool-v1`, in the position functions.
- **Transfers:** The sender must be `contract-caller`, so shares move only when their owner calls the LP token itself (`u4`). A contract moves shares it holds by naming itself as the sender. Governance can switch transfers off with `set-transferrable`, which does not affect withdrawals.
- **No native token:** Shares are not a native asset, so wallets attach no post-conditions to them and need none. A deposit or withdrawal keeps its post-conditions on the two pool tokens.
- **Overall balances:** `get-overall-balance` and `get-overall-supply` are exact up to `2^128 - 1` and report that value beyond it. Shares of different bins differ in value, so these are counts, not amounts.
- **Enumeration:** Per-owner enumeration is left to indexers (`sft_*` print events). Keeping it on chain would let anyone grief an account by sending it dust of many ids.

## Token Handling

Tokens are standard SIP-010, in native units. The pool records each token's principal and native-STX flag at listing.

- **Pulls** run in `restrict-assets?` on the trader, and the pool's balance delta must equal the amount (`u3007`).
- **Payouts** run in `as-contract?` with an exact `with-ft` or `with-stx` allowance. Both the pool's and the recipient's balance deltas must equal the amount (`u3007`).
- **Every call into a token,** balance reads included, runs inside one of these guards. During a payout, a token runs as the pool, never as the caller.
- **Native-STX wrappers** are registered with `set-native-stx-token` before listing. The flag is fixed once a pool uses the token (`u1005`).

## Governance Functions

These need the DAO or an enabled extension.

| Function | Purpose |
|----------|---------|
| `create-pool`, `create-private-pool` | List a pool |
| `set-pool-depositor` | Move a private pool to a new depositor |
| `set-fee-discount` | Set a partner discount on a public pool |
| `update-pool-fee` | Change fees and rebate, within the 10% cap. Takes effect when executed |
| `set-pool-status` | Paused: no swaps, no deposits. Sunset: no deposits |
| `set-native-stx-token` | Register a wrapper before it is listed |
| `claim-fees` | Pay accrued protocol fees to a recipient |

## Read-Only Functions

| Function | Returns |
|----------|---------|
| `get-pool`, `get-pool-id`, `get-pool-count` | Pool records and lookup |
| `get-pool-balances` | A bin's stored record |
| `get-bin-state` | Reserves, share supply and rounded liquidity in one read |
| `get-bin-price` | Current price, WAD raw X per raw Y (start price when empty) |
| `get-pool-fees` | Accrued protocol fees |
| `get-fee-rates`, `get-fee-discount` | Rates and discount for an address |
| `quote-swap-*`, `quote-add-to-position` | The call's math on the bin's current state. `-as` variants use the rates of a given address. Quotes check neither pool status nor the input limit (swaps) or depositor (deposits), so one can succeed where the call fails |
| `simulate-swap-*`, `simulate-deposit` | Pure math over explicit balances, on the same code paths |
| `get-sqrt-price`, `get-frame`, `get-bin-liquidity` | Bin geometry and liquidity |
| `mul-div`, `mul-div-up` | The 256-bit mul-div |
| `get-liquidity-token-id`, `parse-liquidity-token-id` | Token id conversion |
| `is-native-stx-token`, `is-listed-token` | Token flags |

## Security Features

### 1. Reserve Accounting
A pool's balance of each token equals the sum of its bins' balances plus its protocol fees. Each LP token id's total supply equals its bin's `total-supply`.

### 2. Trades
A bin's price stays inside the bin. Every trade strictly increases its bin's exact liquidity and never passes the trader's price limit. Each output carries a `2⁻⁴⁰` + 1 frame-unit margin in the pool's favour, and the liquidity bound adds about `2⁻⁵⁴`.

### 3. Fair Deposits
The deposit fee is designed so that depositing and then withdrawing cannot beat swapping at the depositor's own fee rate. Property fuzzing has found no round trip that does; it is not proven.

### 4. Exits
`reduce-position` and `reduce-positions` work in paused and sunset pools, whatever the DAO's extensions are.

### 5. Owner-Only Shares
Only the pool mints and burns shares. Shares move only when their owner calls the LP token itself, and redeem only when it calls the pool itself, so no contract the owner calls can move or redeem them. A private pool's shares are minted only to its depositor, and to the pool itself for the first-deposit lock.

### 6. Contained Tokens
Every call into a token runs inside an asset guard, and a token cannot move anything beyond that guard's exact allowance ([Token Handling](#token-handling)).

## Security Considerations

### Tokens
- **Standard SIP-010 only:** Only reviewed, standard, non-rebasing tokens are listed. Rebasing tokens would break reserve accounting.
- **Truthful `get-balance`:** Delivery checks rely on it. A token whose getter misreports balances is outside the theft-resistance claim.
- **Under-delivering tokens fail closed:** While a listed token under-delivers, its exits wait until it behaves. A two-token withdrawal also holds back the other asset in that call.
- **During a pull, a token runs as its owner:** It can move nothing of the owner's beyond the amount, but anything that checks the transaction sender accepts it. During a payout it runs as the pool.
- **Native-STX registration:** A token misregistered as native STX, or the reverse, fails closed on its transfers, so its pool can never receive funds.

### The Transaction Sender Trades
Swaps and deposits take and pay the transaction sender's tokens, whichever contract makes the call, so any contract a user calls can trade or deposit with the user's tokens. Wallets sign in deny mode, with conditions on what the user sends and on the minimum the pool must pay out. A deposit pays out nothing a condition can check, so deposit by calling the pool or the router directly, with your own price window and `min-shares`.

### Fee Changes
A fee change takes effect in the block it is executed. Clients set every swap's minimum output from a fresh quote less the trader's slippage tolerance, never 0, and a deadline a few minutes ahead. The 10% cap bounds what a raised fee can take. A swap that stops before spending its input (at its price limit, or after emptying the bins it lists) keeps its output when the fee rises, so the minimum does not see the raise. Sending the quoted input (the quote's `in`) instead of a larger budget turns a raise into a smaller output, which the minimum bounds.

### Private Pools
Anyone holding shares withdraws, also when the pool is paused. While LP transfers are enabled, a wallet depositor can hand its shares to others, so a private pool is meant to name a reviewed vault contract. A new depositor adds beside the old one, which keeps its shares and can withdraw them.

### Partner Discounts
Discounts lower what a pool's LPs earn from that partner, so each pool's discounts are disclosed. A discounted contract passes its discount to everyone who can make it trade, so a discount given to a contract applies to every caller it trades for. A contract that trades as itself does not pass its users' discounts on. A discount so small that the fee times the discount is below `1e8` changes nothing after rounding.

### Liquidity
- **Fees follow the shares present:** A bin's LP fee credit goes to the shares that exist when a swap executes. Liquidity added just before a swap and withdrawn just after takes part of that swap's fee. The trader gets the deeper bin, and long-term LPs of that bin earn less.
- **Resting price:** The LP fee share moves a bin's resting price slightly past the trader's limit, by about `(lp-fee / net)` × the move. The trader's own execution respects the limit.
- **Rounded liquidity:** The rounded `L` is not monotone at power-of-two reserve boundaries, inside the proven error bound. The safety argument relies on the exact `L`.
- **Frame bound:** A bin holds at most about `2¹¹⁸` raw units of the pool's cheaper token. Near that bound a swap fills a little less than would fit, and a further swap takes the rest. That is over $70 million of value in one bin unless a raw unit of the cheaper token is worth less than about `10⁻²⁷` USD.

### Shares
- **Integrations:** No contract can take a user's shares, so an integration that needs LP exposure takes the two pool tokens and adds liquidity as itself, as a vault does. A contract that acts through other contracts, such as an ExecutorDAO-style treasury whose proposals make the calls, can never move or redeem shares it holds.
- **Totals are counts:** Value a position from its per-id balances (`get-balance`) and each bin's state (`get-bin-state`), and a batch from its per-bin events.
- **Withdraw with minimums:** Quote each bin from `get-bin-state`. A burn of `floor(balance · percent / 1e8)` shares pays `floor(balance-x · shares / total-supply)` of X, and likewise Y. Set `min-dx` and `min-dy` from the quote less the slippage the user accepts, and at least 1 on a side that quotes at least 1. `reduce-positions` checks its minimums on the totals, so leave out a bin that quotes 0 of both.

### Unsolicited Transfers
Tokens sent directly to the pool sit outside the accounting and have no recovery path.

## Constraints

- **Amounts:** At or above the frame bound (`2^118`, scaled per bin) fail cleanly with `u3005`.
- **Ticks:** Outside the table above fail with `u3004`.
- **Rounding:** A deposit pays about `2⁻⁵⁴` of the bin's value to the liquidity error margins, so tiny deposits into large bins mint few or no shares.
- **Price precision:** WAD prices are whole units of `10⁻¹⁸` raw X per raw Y, so they lose digits as the raw price falls, and read 0 below `10⁻¹⁸`. Pools are oriented with a raw price of at least 1.

See [errors.md](errors.md) for every code.
