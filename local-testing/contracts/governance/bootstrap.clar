;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;;
;; Production bootstrap proposal: hands the executor-dao to itself, enables
;; the operators multisig as its only extension, and seeds the multisig. The
;; pool is not an extension: the LP token accepts mint and burn from the pool
;; itself, so the pool needs no DAO authority.
;; Afterwards every change - listing pools, native-STX wrappers,
;; fees, pauses, operators - is a proposal approved by the operators and
;; executed by the DAO.
;;
;; OPERATORS and THRESHOLD are the initial signer set; later proposals change it.
;; Activated once by the deployer: (contract-call? .executor-dao construct .bootstrap).
(impl-trait .proposal-trait.proposal-trait)

(define-constant OPERATORS (list tx-sender))
(define-constant THRESHOLD u1)

(define-private (add-operator (who principal) (prior (response bool uint)))
  (match prior ok-value (contract-call? .operators set-operator who true) err-value prior))

(define-public (execute (sender principal))
  (begin
    (asserts! (is-eq tx-sender .executor-dao) (err u1))
    (try! (contract-call? .executor-dao set-extension .operators true))
    (try! (fold add-operator OPERATORS (ok true)))
    (try! (contract-call? .operators set-threshold THRESHOLD))
    (print { event: "bootstrap", sender: sender, operators: OPERATORS, threshold: THRESHOLD })
    (ok true)))
