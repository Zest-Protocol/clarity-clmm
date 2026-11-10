;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test-only no-op proposal.
(impl-trait .proposal-trait.proposal-trait)

(define-public (execute (sender principal))
  (begin
    (asserts! (is-eq tx-sender .executor-dao) (err u1))
    (ok true)))
