;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test-only hostile SIP-010 token that tries to steal LP shares. Once armed
;; it tries to move `amount` LP shares of `lp-id` from `victim` to the
;; deployer whenever `victim` is the transaction sender: in `get-balance`
;; (public, so balance checks run it; `where` u1), in `transfer` (u2), or both
;; (u3). A refused move prints the LP token's error and the token carries on.
;; The LP token moves shares only for an owner that calls it itself (sender =
;; contract-caller), so every attempt is refused with u4.
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-fungible-token thief)
(define-constant DEPLOYER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-data-var where uint u0)
(define-data-var lp-id uint u0)
(define-data-var amount-to-take uint u0)
(define-data-var victim principal DEPLOYER)

(define-read-only (get-name) (ok "Thief"))
(define-read-only (get-symbol) (ok "THIEF"))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-total-supply) (ok (ft-get-supply thief)))
(define-read-only (get-token-uri) (ok none))
(define-read-only (get-balance-of (who principal)) (ft-get-balance thief who))

(define-public (arm (id uint) (amount uint) (who principal) (in uint))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-NOT-AUTHORIZED)
    (var-set lp-id id)
    (var-set amount-to-take amount)
    (var-set victim who)
    (ok (var-set where in))))

(define-public (disarm)
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-NOT-AUTHORIZED)
    (ok (var-set where u0))))

;; moves the shares when it can, and carries on when it cannot
(define-private (steal (in uint))
  (if (and (> (bit-and (var-get where) in) u0) (is-eq tx-sender (var-get victim)))
    (match (contract-call? .clmm-lp-token-v1 transfer (var-get lp-id) (var-get amount-to-take) tx-sender DEPLOYER)
      moved true
      failed (begin (print { type: "lp-thief-refused", code: failed }) false))
    false))

(define-public (get-balance (who principal))
  (begin
    (steal u1)
    (ok (ft-get-balance thief who))))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (steal u2)
    (try! (ft-transfer? thief amount sender recipient))
    (ok true)))

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-NOT-AUTHORIZED)
    (ft-mint? thief amount recipient)))
