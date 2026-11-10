;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;;
;; TEST-ONLY reference (mocks are never deployed to a network): a multi-bin
;; router that calls the pool bin by bin.
;; It calls the single-bin swap-*-ioc once per bin, and the route equivalence
;; test checks clmm-router-v1 / clmm-pool-v1 swap-*-route against it.

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR-INSUFFICIENT-LIQUIDITY (err u5001))
(define-constant ERR-SLIPPAGE (err u5002))
(define-constant ERR-INVALID-ROUTE (err u5003))

;; ------------------------------------------------------ multi-bin swaps --
;; Walks `ticks`, which must be strictly ascending for X->Y and strictly
;; descending for Y->X (the price order, in which a walk is output-maximal),
;; spending what is left in each bin. `max-price`/`min-price` bound the
;; marginal price; `min-dy`/`min-dx` bound the total output. Bins without
;; output reserve, bins beyond the price limit and bins visited after the
;; input is spent cost nothing. Every bin's swap gets `deadline`.

(define-private (swap-x-for-y-iter (tick int) (s (response { token-x-trait: <ft-trait>, token-y-trait: <ft-trait>, pool-id: uint, max-price: uint, dx: uint, actual-dx: uint, actual-dy: uint, fee: uint, last: (optional int), deadline: uint } uint)))
  (let (
      (rs (try! s))
      (checked (asserts! (match (get last rs) last (> tick last) true) ERR-INVALID-ROUTE))
      (dx (get dx rs))
      (result (if (> dx u0)
        (try! (contract-call? .clmm-pool-v1 swap-x-for-y-ioc (get token-x-trait rs) (get token-y-trait rs) (get pool-id rs) tick dx (get max-price rs) u0 (get deadline rs)))
        { dx: u0, dy: u0, fee: u0 })))
    (ok (merge rs {
      dx: (- dx (get dx result)),
      actual-dx: (+ (get actual-dx rs) (get dx result)),
      actual-dy: (+ (get actual-dy rs) (get dy result)),
      fee: (+ (get fee rs) (get fee result)),
      last: (some tick) }))))

(define-public (swap-x-for-y (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (dx uint) (max-price uint) (ticks (list 32 int)) (min-dy uint) (allow-partial-fill bool) (deadline uint))
  (let ((rs (try! (fold swap-x-for-y-iter ticks
      (ok { token-x-trait: token-x-trait, token-y-trait: token-y-trait, pool-id: pool-id, max-price: max-price, dx: dx, actual-dx: u0, actual-dy: u0, fee: u0, last: none, deadline: deadline })))))
    (asserts! (or allow-partial-fill (is-eq (get dx rs) u0)) ERR-INSUFFICIENT-LIQUIDITY)
    (asserts! (>= (get actual-dy rs) min-dy) ERR-SLIPPAGE)
    (ok { dx: (get actual-dx rs), dy: (get actual-dy rs), fee: (get fee rs) })))

(define-private (swap-y-for-x-iter (tick int) (s (response { token-x-trait: <ft-trait>, token-y-trait: <ft-trait>, pool-id: uint, min-price: uint, dy: uint, actual-dx: uint, actual-dy: uint, fee: uint, last: (optional int), deadline: uint } uint)))
  (let (
      (rs (try! s))
      (checked (asserts! (match (get last rs) last (< tick last) true) ERR-INVALID-ROUTE))
      (dy (get dy rs))
      (result (if (> dy u0)
        (try! (contract-call? .clmm-pool-v1 swap-y-for-x-ioc (get token-x-trait rs) (get token-y-trait rs) (get pool-id rs) tick dy (get min-price rs) u0 (get deadline rs)))
        { dx: u0, dy: u0, fee: u0 })))
    (ok (merge rs {
      dy: (- dy (get dy result)),
      actual-dx: (+ (get actual-dx rs) (get dx result)),
      actual-dy: (+ (get actual-dy rs) (get dy result)),
      fee: (+ (get fee rs) (get fee result)),
      last: (some tick) }))))

(define-public (swap-y-for-x (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (dy uint) (min-price uint) (ticks (list 32 int)) (min-dx uint) (allow-partial-fill bool) (deadline uint))
  (let ((rs (try! (fold swap-y-for-x-iter ticks
      (ok { token-x-trait: token-x-trait, token-y-trait: token-y-trait, pool-id: pool-id, min-price: min-price, dy: dy, actual-dx: u0, actual-dy: u0, fee: u0, last: none, deadline: deadline })))))
    (asserts! (or allow-partial-fill (is-eq (get dy rs) u0)) ERR-INSUFFICIENT-LIQUIDITY)
    (asserts! (>= (get actual-dx rs) min-dx) ERR-SLIPPAGE)
    (ok { dx: (get actual-dx rs), dy: (get actual-dy rs), fee: (get fee rs) })))
