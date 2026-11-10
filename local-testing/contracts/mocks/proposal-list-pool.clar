;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test-only example of a governance proposal under the production bootstrap:
;; registers the STX wrapper and lists a pool.
(impl-trait .proposal-trait.proposal-trait)

(define-public (execute (sender principal))
  (begin
    (asserts! (is-eq tx-sender .executor-dao) (err u1))
    (try! (contract-call? .clmm-pool-v1 set-native-stx-token .mock-token-stx true))
    (try! (contract-call? .clmm-pool-v1 create-pool .mock-token-stx .mock-token-a u100 u1000000 u1000000 u50000000))
    (ok true)))
