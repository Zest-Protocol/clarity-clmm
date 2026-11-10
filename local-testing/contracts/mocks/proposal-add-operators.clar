;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test-only proposal: moves the operators multisig to 2-of-3.
(impl-trait .proposal-trait.proposal-trait)

(define-public (execute (sender principal))
  (begin
    (asserts! (is-eq tx-sender .executor-dao) (err u1))
    (try! (contract-call? .operators set-operator 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 true))
    (try! (contract-call? .operators set-operator 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG true))
    (try! (contract-call? .operators set-threshold u2))
    (ok true)))
