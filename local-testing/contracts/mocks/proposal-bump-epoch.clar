;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test-only proposal: re-sets the operators threshold (a signer-set change
;; that starts a new approval epoch).
(impl-trait .proposal-trait.proposal-trait)

(define-public (execute (sender principal))
  (begin
    (asserts! (is-eq tx-sender .executor-dao) (err u1))
    (try! (contract-call? .operators set-threshold u2))
    (ok true)))
