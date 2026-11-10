(use-trait proposal-trait .proposal-trait.proposal-trait)
(impl-trait .extension-trait.extension-trait)

(define-constant ERR-NOT-AUTHORIZED (err u4000))
(define-constant ERR-NOT-OPERATOR (err u4001))
(define-constant ERR-ALREADY-APPROVED (err u4002))
(define-constant ERR-ALREADY-EXECUTED (err u4003))
(define-constant ERR-EXPIRED (err u4004))
(define-constant ERR-INVALID-THRESHOLD (err u4005))

(define-constant APPROVAL-WINDOW u241920)

(define-map operators principal bool)
(define-data-var operator-count uint u0)
(define-data-var threshold uint u1)
(define-data-var epoch uint u0)

(define-map proposals principal { approvals: uint, opened-at: uint, epoch: uint, executed: bool })
(define-map approvals { proposal: principal, operator: principal, epoch: uint } bool)

(define-read-only (is-dao-or-extension)
  (ok (asserts! (or (is-eq tx-sender .executor-dao) (contract-call? .executor-dao is-extension contract-caller)) ERR-NOT-AUTHORIZED)))

(define-read-only (is-operator (who principal)) (default-to false (map-get? operators who)))
(define-read-only (get-threshold) (var-get threshold))
(define-read-only (get-operator-count) (var-get operator-count))
(define-read-only (get-proposal (proposal principal)) (map-get? proposals proposal))
(define-read-only (get-epoch) (var-get epoch))

(define-public (set-operator (who principal) (enabled bool))
  (begin
    (try! (is-dao-or-extension))
    (if (is-eq enabled (is-operator who))
      (ok true)
      (begin
        (map-set operators who enabled)
        (var-set operator-count (if enabled (+ (var-get operator-count) u1) (- (var-get operator-count) u1)))
        (var-set epoch (+ (var-get epoch) u1))
        (asserts! (<= (var-get threshold) (var-get operator-count)) ERR-INVALID-THRESHOLD)
        (print { event: "set-operator", operator: who, enabled: enabled })
        (ok true)))))

(define-public (set-threshold (new-threshold uint))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (and (> new-threshold u0) (<= new-threshold (var-get operator-count))) ERR-INVALID-THRESHOLD)
    (print { event: "set-threshold", threshold: new-threshold })
    (var-set epoch (+ (var-get epoch) u1))
    (ok (var-set threshold new-threshold))))

(define-public (approve (proposal <proposal-trait>))
  (let (
      (key (contract-of proposal))
      (current (var-get epoch))
      (fresh { approvals: u0, opened-at: stacks-block-height, epoch: current, executed: false })
      (stored (default-to fresh (map-get? proposals key)))
      (state (if (or (get executed stored) (is-eq (get epoch stored) current)) stored fresh))
      (approvals-now (+ (get approvals state) u1)))
    (asserts! (is-operator tx-sender) ERR-NOT-OPERATOR)
    (asserts! (not (get executed state)) ERR-ALREADY-EXECUTED)
    (asserts! (< stacks-block-height (+ (get opened-at state) APPROVAL-WINDOW)) ERR-EXPIRED)
    (asserts! (map-insert approvals { proposal: key, operator: tx-sender, epoch: current } true) ERR-ALREADY-APPROVED)
    (print { event: "approve", proposal: key, operator: tx-sender, approvals: approvals-now })
    (if (>= approvals-now (var-get threshold))
      (begin
        (map-set proposals key (merge state { approvals: approvals-now, executed: true }))
        (contract-call? .executor-dao execute proposal tx-sender))
      (begin
        (map-set proposals key (merge state { approvals: approvals-now }))
        (ok false)))))

(define-public (callback (sender principal) (memo (buff 34)))
  (ok true))
