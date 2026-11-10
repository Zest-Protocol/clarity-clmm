;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Devnet/test bootstrap proposal. As in the production bootstrap, the pool
;; is not a DAO extension: it needs no DAO authority. The deployer is one, so
;; tests can exercise governance functions directly; the production bootstrap
;; (governance/bootstrap.clar) does not enable it.
(impl-trait .proposal-trait.proposal-trait)

(use-trait proposal-trait .proposal-trait.proposal-trait)

(define-constant DEPLOYER tx-sender)

(define-public (execute (sender principal))
  (begin
    (asserts! (is-eq tx-sender .executor-dao) (err u1))
    (try! (contract-call? .executor-dao set-extensions (list
      { extension: current-contract, enabled: true }
      { extension: DEPLOYER, enabled: true })))
    (try! (contract-call? .clmm-pool-v1 set-native-stx-token .mock-token-stx true))
    (ok true)))

;; lets tests run follow-up proposals through the DAO
(define-public (execute-proposal (proposal <proposal-trait>))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) (err u1))
    (contract-call? .executor-dao execute proposal tx-sender)))
