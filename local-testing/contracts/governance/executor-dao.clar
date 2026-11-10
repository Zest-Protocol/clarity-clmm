;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;;
;; executor-dao
;;
;; Minimal ExecutorDAO core (the interface of the ExecutorDAO pattern widely
;; used on Stacks):
;; the DAO itself or an enabled extension may enable extensions and execute
;; proposals. Protocol contracts authorise governance calls with
;;   (or (is-eq tx-sender .executor-dao)
;;       (contract-call? .executor-dao is-extension contract-caller))

(use-trait proposal-trait .proposal-trait.proposal-trait)
(use-trait extension-trait .extension-trait.extension-trait)

(define-constant ERR-UNAUTHORISED (err u1000))
(define-constant ERR-ALREADY-EXECUTED (err u1001))
(define-constant ERR-INVALID-EXTENSION (err u1002))

(define-data-var executive principal tx-sender)
(define-map executed-proposals principal uint)
(define-map extensions principal bool)

(define-private (is-self-or-extension)
  (ok (asserts! (or (is-eq tx-sender current-contract) (is-extension contract-caller)) ERR-UNAUTHORISED)))

(define-read-only (is-extension (extension principal))
  (default-to false (map-get? extensions extension)))

(define-read-only (executed-at (proposal principal))
  (map-get? executed-proposals proposal))

(define-public (set-extension (extension principal) (enabled bool))
  (begin
    (try! (is-self-or-extension))
    (print { event: "extension", extension: extension, enabled: enabled })
    (ok (map-set extensions extension enabled))))

(define-private (set-extensions-iter (item { extension: principal, enabled: bool }))
  (begin
    (print { event: "extension", extension: (get extension item), enabled: (get enabled item) })
    (map-set extensions (get extension item) (get enabled item))))

(define-public (set-extensions (extension-list (list 200 { extension: principal, enabled: bool })))
  (begin
    (try! (is-self-or-extension))
    (ok (map set-extensions-iter extension-list))))

;; Proposals run with the DAO's authority. They are trusted by definition
;; (only the DAO or an extension can execute them), hence the unrestricted
;; asset allowance.
(define-public (execute (proposal <proposal-trait>) (sender principal))
  (begin
    (try! (is-self-or-extension))
    (asserts! (map-insert executed-proposals (contract-of proposal) stacks-block-height) ERR-ALREADY-EXECUTED)
    (print { event: "execute", proposal: proposal })
    (as-contract? ((with-all-assets-unsafe)) (try! (contract-call? proposal execute sender)))))

;; One-time bootstrap: the deployer hands the DAO to itself by executing the
;; bootstrap proposal. The deployer must call it directly, so no contract it
;; calls can construct the DAO with another proposal.
(define-public (construct (proposal <proposal-trait>))
  (let ((sender tx-sender))
    (asserts! (is-eq contract-caller (var-get executive)) ERR-UNAUTHORISED)
    (var-set executive current-contract)
    (as-contract? ((with-all-assets-unsafe)) (try! (execute proposal sender)))))

(define-public (request-extension-callback (extension <extension-trait>) (memo (buff 34)))
  (let ((sender tx-sender))
    (asserts! (is-extension contract-caller) ERR-INVALID-EXTENSION)
    (asserts! (is-eq contract-caller (contract-of extension)) ERR-INVALID-EXTENSION)
    (as-contract? ((with-all-assets-unsafe)) (try! (contract-call? extension callback sender memo)))))
