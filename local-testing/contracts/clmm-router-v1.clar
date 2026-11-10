;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;;
;; clmm-router-v1 - batching and routing on top of clmm-pool-v1.
;; Stateless: every call executes as the transaction sender.

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u5001))
(define-constant ERR-SLIPPAGE (err u5002))
(define-constant ERR-INVALID-ROUTE (err u5003))
(define-constant ERR-EXPIRED (err u5004))

(define-constant UINT-MAX u340282366920938463463374607431768211455)

;; ---------------------------------------------------- batched positions --

(define-private (add-to-positions-iter
    (position { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint, min-shares: uint })
    (s (response { token-x-trait: <ft-trait>, token-y-trait: <ft-trait>, pool-id: uint, results: (list 100 { dx: uint, dy: uint, shares: uint, fee-x: uint, fee-y: uint }) } uint)))
  (let (
      (rs (try! s))
      (result (try! (contract-call? .clmm-pool-v1 add-to-position (get token-x-trait rs) (get token-y-trait rs) (get pool-id rs)
        (get tick position) (get max-x position) (get max-y position) (get min-price position) (get max-price position) (get min-shares position)))))
    (ok (merge rs { results: (unwrap! (as-max-len? (append (get results rs) result) u100) ERR-INVALID-ROUTE) }))))

(define-public (add-to-positions-many (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint)
    (positions (list 100 { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint, min-shares: uint })))
  (ok (get results (try! (fold add-to-positions-iter positions
    (ok { token-x-trait: token-x-trait, token-y-trait: token-y-trait, pool-id: pool-id, results: (list) }))))))

;; Withdrawals are not batched here: the pool redeems shares only for an owner
;; that calls it directly, and its reduce-positions withdraws from up to 64
;; bins in one call.

;; ------------------------------------------------------ single-bin swaps --
;; Every swap passes its `deadline` (seconds) to the pool, which refuses it
;; once stacks-block-time is past it (2013, here 5004).

;; fill-or-kill: all of `dx` must be swapped inside the bin, for at least
;; `min-dy`, which the pool checks (its 2009 becomes 5002, see router-error)
(define-public (swap-x-for-y-fok (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (tick int) (dx uint) (max-price uint) (min-dy uint) (deadline uint))
  (match (contract-call? .clmm-pool-v1 swap-x-for-y-ioc token-x-trait token-y-trait pool-id tick dx max-price min-dy deadline)
    result (begin
      (asserts! (is-eq (get dx result) dx) ERR-INSUFFICIENT-LIQUIDITY)
      (ok result))
    code (err (router-error code))))

(define-public (swap-y-for-x-fok (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (tick int) (dy uint) (min-price uint) (min-dx uint) (deadline uint))
  (match (contract-call? .clmm-pool-v1 swap-y-for-x-ioc token-x-trait token-y-trait pool-id tick dy min-price min-dx deadline)
    result (begin
      (asserts! (is-eq (get dy result) dy) ERR-INSUFFICIENT-LIQUIDITY)
      (ok result))
    code (err (router-error code))))

;; ------------------------------------------------------ multi-bin swaps --
;; One call into the pool walks the bins (clmm-pool-v1 swap-*-route), so a route
;; pays one pool load and one transfer each way. The pool's errors, here and in
;; the fill-or-kill swaps, are mapped onto this contract's codes: 2010 -> 5001
;; (not filled), 2009 -> 5002 (slippage), 2011 -> 5003 (tick order), 2013 ->
;; 5004 (expired). Other pool errors pass through.

(define-private (router-error (code uint))
  (if (is-eq code u2010) u5001
  (if (is-eq code u2009) u5002
  (if (is-eq code u2011) u5003
  (if (is-eq code u2013) u5004
  code)))))

;; Walks `ticks`, which must be strictly ascending for X->Y and strictly
;; descending for Y->X (the price order, in which a walk is output-maximal),
;; spending what is left in each bin. `max-price`/`min-price` bound the
;; marginal price; `min-dy`/`min-dx` bound the total output. Bins without
;; output reserve and bins beyond the price limit are read but not written;
;; bins after the input is spent are skipped without a read.

(define-public (swap-x-for-y (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (dx uint) (max-price uint) (ticks (list 32 int)) (min-dy uint) (allow-partial-fill bool) (deadline uint))
  (match (contract-call? .clmm-pool-v1 swap-x-for-y-route token-x-trait token-y-trait pool-id ticks dx max-price min-dy allow-partial-fill deadline)
    result (ok result)
    code (err (router-error code))))

(define-public (swap-y-for-x (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (dy uint) (min-price uint) (ticks (list 32 int)) (min-dx uint) (allow-partial-fill bool) (deadline uint))
  (match (contract-call? .clmm-pool-v1 swap-y-for-x-route token-x-trait token-y-trait pool-id ticks dy min-price min-dx allow-partial-fill deadline)
    result (ok result)
    code (err (router-error code))))

;; ------------------------------------------------------- multi-pool routes --
;; `tokens` lists the path in order: tokens[0] is sold, tokens[n] is bought.
;; Each hop must be filled completely; `min-token-out` bounds the result and
;; every hop gets `deadline`.

(define-private (swap-routes-iter (step { pool-id: uint, ticks: (list 32 int), x-for-y: bool }) (s (response { token-in: uint, tokens: (list 10 <ft-trait>), deadline: uint } uint)))
  (let (
      (rs (try! s))
      (tokens (get tokens rs))
      (token-a (unwrap! (element-at? tokens u0) ERR-INVALID-ROUTE))
      (token-b (unwrap! (element-at? tokens u1) ERR-INVALID-ROUTE))
      (rest (unwrap! (slice? tokens u1 (len tokens)) ERR-INVALID-ROUTE)))
    (ok { token-in: (if (get x-for-y step)
        (get dy (try! (swap-x-for-y token-a token-b (get pool-id step) (get token-in rs) UINT-MAX (get ticks step) u0 false (get deadline rs))))
        (get dx (try! (swap-y-for-x token-b token-a (get pool-id step) (get token-in rs) u0 (get ticks step) u0 false (get deadline rs))))),
      tokens: rest,
      deadline: (get deadline rs) })))

(define-public (swap-routes (tokens (list 10 <ft-trait>)) (routes (list 9 { pool-id: uint, ticks: (list 32 int), x-for-y: bool })) (token-in uint) (min-token-out uint) (deadline uint))
  (let ((rs (try! (fold swap-routes-iter routes (ok { token-in: token-in, tokens: tokens, deadline: deadline })))))
    (asserts! (is-eq (+ (len routes) u1) (len tokens)) ERR-INVALID-ROUTE)
    (asserts! (>= (get token-in rs) min-token-out) ERR-SLIPPAGE)
    (ok { token-in: token-in, token-out: (get token-in rs) })))
