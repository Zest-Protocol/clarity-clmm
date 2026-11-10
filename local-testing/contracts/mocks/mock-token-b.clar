;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test/devnet-only SIP-010 token (6 decimals). Not part of the protocol.
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-fungible-token token-b)
(define-constant DEPLOYER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u1000))

(define-read-only (get-name) (ok "Token B"))
(define-read-only (get-symbol) (ok "TKB"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance token-b who)))
(define-read-only (get-total-supply) (ok (ft-get-supply token-b)))
(define-read-only (get-token-uri) (ok none))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (try! (ft-transfer? token-b amount sender recipient))
    (match memo m (print m) 0x)
    (ok true)))

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-NOT-AUTHORIZED)
    (ft-mint? token-b amount recipient)))
