;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;; Test-only example of the proposal that puts a client vault live: a private
;; pool naming the vault as depositor, then the vault's one-time
;; configuration.
;; Client wallet_1, manager wallet_2, fee recipient wallet_3, phi 20%.
(impl-trait .proposal-trait.proposal-trait)

(define-public (execute (sender principal))
  (let ((pool-id (try! (contract-call? .clmm-pool-v1 create-private-pool .mock-token-a .mock-token-b u100 u300000 u300000 u50000000 .clmm-vault-v1))))
    (asserts! (is-eq tx-sender .executor-dao) (err u1))
    (contract-call? .clmm-vault-v1 initialize pool-id
      'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5
      'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG
      'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC
      u20000000)))
