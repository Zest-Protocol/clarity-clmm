;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test/devnet-only SIP-010 wrapper around native STX (6 decimals): transfer
;; moves native STX, so contracts paying it out need a `with-stx` allowance.
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u1000))

(define-read-only (get-name) (ok "Stacks"))
(define-read-only (get-symbol) (ok "STX"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-balance (who principal)) (ok (stx-get-balance who)))
(define-read-only (get-total-supply) (ok stx-liquid-supply))
(define-read-only (get-token-uri) (ok none))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (try! (stx-transfer? amount sender recipient))
    (match memo m (print m) 0x)
    (ok true)))
