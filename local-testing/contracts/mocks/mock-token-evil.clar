;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test-only hostile SIP-010 token. Depending on `mode`, its transfer behaves
;; honestly (u0), moves twice the requested amount (u1), additionally moves
;; `amount` of mock-token-a from the sender (u2), or delivers only half of the
;; amount (u3, a fee-on-transfer / phantom token). Modes u4 and u5 deliver half
;; only when the recipient (u4) or the sender (u5) is `target`, like a token
;; with per-address fees, so a single payout can fail while the rest of a call
;; behaves. Mode u6 refuses transfers to `target`, like a token with a
;; blocklist, so one recipient cannot receive. Used to prove that the protocol
;; contains a misbehaving token.
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-fungible-token evil)
(define-constant DEPLOYER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-BLOCKED (err u1001))
(define-data-var mode uint u0)
(define-data-var target principal DEPLOYER)

(define-read-only (get-name) (ok "Evil"))
(define-read-only (get-symbol) (ok "EVIL"))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance evil who)))
(define-read-only (get-total-supply) (ok (ft-get-supply evil)))
(define-read-only (get-token-uri) (ok none))

(define-public (set-mode (new-mode uint))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-NOT-AUTHORIZED)
    (ok (var-set mode new-mode))))

(define-public (set-target (who principal))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-NOT-AUTHORIZED)
    (ok (var-set target who))))

(define-private (halves (sender principal) (recipient principal))
  (or
    (is-eq (var-get mode) u3)
    (and (is-eq (var-get mode) u4) (is-eq recipient (var-get target)))
    (and (is-eq (var-get mode) u5) (is-eq sender (var-get target)))))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (not (and (is-eq (var-get mode) u6) (is-eq recipient (var-get target)))) ERR-BLOCKED)
    (try! (ft-transfer? evil (if (halves sender recipient) (/ amount u2) amount) sender recipient))
    (and (is-eq (var-get mode) u1) (try! (ft-transfer? evil amount sender DEPLOYER)))
    (and (is-eq (var-get mode) u2) (try! (contract-call? .mock-token-a transfer amount sender DEPLOYER none)))
    (ok true)))

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-NOT-AUTHORIZED)
    (ft-mint? evil amount recipient)))
