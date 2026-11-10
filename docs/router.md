# Router

`clmm-router-v1` batches and routes on top of [`clmm-pool-v1`](pool.md). It is stateless and holds no funds. Every call executes as the transaction sender, so the pool sees the user as `tx-sender`, and partner discounts and private-pool depositor checks apply to that user.

Every swap takes a `deadline` in seconds, a Unix time compared with `stacks-block-time`. A swap mined after it fails with `u5004`.

## Multi-Bin Swaps

```clarity
(swap-x-for-y token-x token-y pool-id dx max-price ticks min-dy allow-partial-fill deadline)
(swap-y-for-x token-x token-y pool-id dy min-price ticks min-dx allow-partial-fill deadline)
```

The walk itself runs in the pool (`swap-*-route`), so a route pays one pool load and one transfer each way.

- **Ticks:** Up to 32, strictly ascending for X→Y and strictly descending for Y→X. This is the price order, in which a walk is output-maximal.
- **Bounds:** `max-price` / `min-price` bound the marginal price, and `min-dy` / `min-dx` bound the total output.
- **Skipped bins:** Bins without output reserve and bins beyond the price limit are read but not written. Bins after the input is spent are skipped without a read.

The pool keeps no active bin, so clients find the best bin from the bins' state (`get-bin-state`): for X→Y the lowest tick that holds Y, for Y→X the highest tick that holds X. They list consecutive ticks from it, up to 32, so that a bin that gains liquidity after the quote is still visited, and none past the bin step's last tick (`u3004`).

The pool's errors are mapped onto the router's codes here and in the fill-or-kill swaps. Other pool errors pass through.

| Pool | Router | Meaning |
|------|--------|---------|
| `u2010` | `u5001` | Not filled |
| `u2009` | `u5002` | Slippage |
| `u2011` | `u5003` | Tick order |
| `u2013` | `u5004` | Expired |

## Fill-or-Kill in One Bin

```clarity
(swap-x-for-y-fok token-x token-y pool-id tick dx max-price min-dy deadline)
(swap-y-for-x-fok token-x token-y pool-id tick dy min-price min-dx deadline)
```

All of the input must be swapped inside the bin (`u5001`), for at least the minimum output (`u5002`).

## Multi-Pool Routes

```clarity
(swap-routes tokens routes token-in min-token-out deadline)
```

`tokens` lists the path in order: `tokens[0]` is sold and the last is bought. `routes` gives up to 9 hops of `{ pool-id, ticks, x-for-y }`, so `len(tokens)` must be `len(routes) + 1` (`u5003`).

Each hop must be filled completely, and every hop gets `deadline`. `min-token-out` bounds the final result (`u5002`). Hops run with no price limit and no per-hop minimum, so `min-token-out` is the route's slippage protection.

## Batched Deposits

```clarity
(add-to-positions-many token-x token-y pool-id positions)
```

Up to 100 positions, each with its own bounds. Any failure reverts the whole batch.

Withdrawals are not batched in the router: the pool redeems shares only for an owner that calls it directly. Use the pool's `reduce-positions`, which withdraws from up to 64 bins in one call.
