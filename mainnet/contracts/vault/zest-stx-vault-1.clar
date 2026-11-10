(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-MATH-OVERFLOW (err u3006))

(define-constant ERR-NOT-CLIENT (err u6001))
(define-constant ERR-NOT-MANAGER (err u6002))
(define-constant ERR-MANAGER-PAUSED (err u6003))
(define-constant ERR-NOT-INITIALIZED (err u6004))
(define-constant ERR-ALREADY-INITIALIZED (err u6005))
(define-constant ERR-NOT-DEPOSITOR (err u6006))
(define-constant ERR-INVALID-TOKEN (err u6007))
(define-constant ERR-INVALID-FEE (err u6008))
(define-constant ERR-INVALID-ADDRESS (err u6009))
(define-constant ERR-TOO-MANY-BINS (err u6010))
(define-constant ERR-NOT-HELD (err u6011))
(define-constant ERR-TICK-ORDER (err u6012))
(define-constant ERR-INVALID-PERCENT (err u6013))
(define-constant ERR-INVALID-AMOUNT (err u6014))
(define-constant ERR-DEPOSIT-FEE (err u6015))
(define-constant ERR-VALUE-FELL (err u6016))
(define-constant ERR-POOL-MISMATCH (err u6017))
(define-constant ERR-TRANSFER-MISMATCH (err u6018))
(define-constant ERR-SLIPPAGE (err u6019))
(define-constant ERR-EXPIRED (err u6020))

(define-constant ONE_8 u100000000)
(define-constant MAX-U128 u340282366920938463463374607431768211455)
(define-constant M64 u18446744073709551615)
(define-constant TWO64 u18446744073709551616)
(define-constant TOKEN-ID-MOD u18446744073709551616)
(define-constant TOKEN-ID-OFFSET 4294967296)
(define-constant MAX-BINS u64)

(define-constant FEE-SHIFT u40)
(define-constant FEE-DUST u16)

(define-data-var config { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
  client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool }
  { initialized: false, pool-id: u0, token-x: current-contract, token-y: current-contract, native-x: false, native-y: false,
    client: current-contract, manager: current-contract, fee-recipient: current-contract, manager-fee: u0, manager-paused: false })

(define-data-var held (list 64 int) (list))

(define-data-var idle { x: uint, y: uint } { x: u0, y: u0 })

(define-data-var owed { x: uint, y: uint } { x: u0, y: u0 })

(define-map bin-principal int { n: uint, k: uint })

(define-read-only (is-dao-or-extension)
  (ok (asserts! (or (is-eq tx-sender .executor-dao) (contract-call? .executor-dao is-extension contract-caller)) ERR-NOT-AUTHORIZED)))

(define-read-only (get-config) (var-get config))
(define-read-only (get-totals) { idle: (var-get idle), owed: (var-get owed), held: (var-get held) })
(define-read-only (get-principal (tick int)) (principal-of tick))

(define-read-only (get-position (tick int))
  (let (
      (cfg (var-get config))
      (st (try! (bin-state (get pool-id cfg) tick)))
      (p (principal-of tick))
      (sp (try! (split-shares st p (get manager-fee cfg))))
      (h (get h st))
      (ox (if (> h u0) (try! (mul-div (get x st) h (get s st))) u0))
      (oy (if (> h u0) (try! (mul-div (get y st) h (get s st))) u0))
      (mx (if (> h u0) (try! (mul-div ox (get m sp) h)) u0))
      (my (if (> h u0) (try! (mul-div oy (get m sp) h)) u0)))
    (ok { n: (get n p), k: (get k p), shares: h, client-shares: (get c sp), manager-shares: (get m sp),
      client-x: (- ox mx), client-y: (- oy my), manager-x: mx, manager-y: my })))

(define-public (initialize (pool-id uint) (client principal) (manager principal) (fee-recipient principal) (manager-fee uint))
  (let ((pool (unwrap! (contract-call? .clmm-pool-v1 get-pool pool-id) ERR-NOT-DEPOSITOR)))
    (try! (is-dao-or-extension))
    (asserts! (not (get initialized (var-get config))) ERR-ALREADY-INITIALIZED)
    (asserts! (is-eq (get depositor pool) (some current-contract)) ERR-NOT-DEPOSITOR)
    (asserts! (<= manager-fee ONE_8) ERR-INVALID-FEE)
    (asserts! (not (or (is-eq client current-contract) (is-eq client .executor-dao)
      (is-eq fee-recipient current-contract) (is-eq fee-recipient .executor-dao))) ERR-INVALID-ADDRESS)
    (var-set config { initialized: true, pool-id: pool-id, token-x: (get token-x pool), token-y: (get token-y pool),
      native-x: (get native-x pool), native-y: (get native-y pool), client: client, manager: manager,
      fee-recipient: fee-recipient, manager-fee: manager-fee, manager-paused: false })
    (print { type: "initialize", pool-id: pool-id, token-x: (get token-x pool), token-y: (get token-y pool), client: client,
      manager: manager, fee-recipient: fee-recipient, manager-fee: manager-fee, sender: tx-sender })
    (ok true)))

(define-public (set-manager-fee (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (manager-fee uint))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (try! (is-dao-or-extension))
    (asserts! (<= manager-fee ONE_8) ERR-INVALID-FEE)
    (let ((w (try! (do-harvest token-x-trait token-y-trait cfg true))))
      (var-set config (merge cfg { manager-fee: manager-fee }))
      (print { type: "set-manager-fee", old-manager-fee: (get manager-fee cfg), manager-fee: manager-fee, shares: (get shares w),
        dx: (get dx w), dy: (get dy w), recipient: (get fee-recipient cfg), sender: tx-sender })
      (ok w))))

(define-public (set-manager (manager principal))
  (let ((cfg (try! (loaded))))
    (try! (is-dao-or-extension))
    (var-set config (merge cfg { manager: manager }))
    (print { type: "set-manager", old-manager: (get manager cfg), manager: manager, sender: tx-sender })
    (ok true)))

(define-public (set-fee-recipient (fee-recipient principal))
  (let ((cfg (try! (loaded))))
    (try! (is-dao-or-extension))
    (asserts! (not (or (is-eq fee-recipient current-contract) (is-eq fee-recipient .executor-dao))) ERR-INVALID-ADDRESS)
    (var-set config (merge cfg { fee-recipient: fee-recipient }))
    (print { type: "set-fee-recipient", old-fee-recipient: (get fee-recipient cfg), fee-recipient: fee-recipient, sender: tx-sender })
    (ok true)))

(define-public (deposit (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (dx uint) (dy uint))
  (let (
      (cfg (try! (load token-x-trait token-y-trait)))
      (i (var-get idle)))
    (asserts! (called-by (get client cfg)) ERR-NOT-CLIENT)
    (asserts! (or (> dx u0) (> dy u0)) ERR-INVALID-AMOUNT)
    (try! (pull token-x-trait (get token-x cfg) (get native-x cfg) dx tx-sender))
    (try! (pull token-y-trait (get token-y cfg) (get native-y cfg) dy tx-sender))
    (var-set idle { x: (+ (get x i) dx), y: (+ (get y i) dy) })
    (print { type: "deposit", dx: dx, dy: dy, idle-x: (+ (get x i) dx), idle-y: (+ (get y i) dy), sender: tx-sender })
    (ok { idle-x: (+ (get x i) dx), idle-y: (+ (get y i) dy) })))

(define-public (withdraw (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (percent uint) (min-dx uint) (min-dy uint))
  (let (
      (cfg (try! (load token-x-trait token-y-trait)))
      (held-now (var-get held))
      (i (var-get idle)))
    (asserts! (called-by (get client cfg)) ERR-NOT-CLIENT)
    (asserts! (and (> percent u0) (<= percent ONE_8)) ERR-INVALID-PERCENT)
    (let (
        (ix (try! (mul-div (get x i) percent ONE_8)))
        (iy (try! (mul-div (get y i) percent ONE_8)))
        (w (try! (burn token-x-trait token-y-trait (get pool-id cfg) (get manager-fee cfg) held-now
          (get items (fold at-percent held-now { percent: percent, items: (list) })))))
        (dx (+ (get dx w) ix))
        (dy (+ (get dy w) iy)))
      (asserts! (and (>= dx min-dx) (>= dy min-dy)) ERR-SLIPPAGE)
      (var-set idle { x: (- (get x i) ix), y: (- (get y i) iy) })
      (try! (pay token-x-trait (get token-x cfg) (get native-x cfg) dx (get client cfg)))
      (try! (pay token-y-trait (get token-y cfg) (get native-y cfg) dy (get client cfg)))
      (print { type: "withdraw", percent: percent, shares: (get shares w), dx: dx, dy: dy, idle-dx: ix, idle-dy: iy,
        manager-x: (get manager-x w), manager-y: (get manager-y w), sender: tx-sender })
      (ok { shares: (get shares w), dx: dx, dy: dy }))))

(define-public (withdraw-ticks (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (ticks (list 64 int)) (percent uint) (min-dx uint) (min-dy uint))
  (let (
      (cfg (try! (load token-x-trait token-y-trait)))
      (held-now (var-get held))
      (items (get items (fold at-percent ticks { percent: percent, items: (list) }))))
    (asserts! (called-by (get client cfg)) ERR-NOT-CLIENT)
    (asserts! (and (> percent u0) (<= percent ONE_8)) ERR-INVALID-PERCENT)
    (try! (fold check-iter items (ok { held: held-now, last: none })))
    (let ((w (try! (burn token-x-trait token-y-trait (get pool-id cfg) (get manager-fee cfg) held-now items))))
      (asserts! (and (>= (get dx w) min-dx) (>= (get dy w) min-dy)) ERR-SLIPPAGE)
      (try! (pay token-x-trait (get token-x cfg) (get native-x cfg) (get dx w) (get client cfg)))
      (try! (pay token-y-trait (get token-y cfg) (get native-y cfg) (get dy w) (get client cfg)))
      (print { type: "withdraw-ticks", percent: percent, ticks: ticks, shares: (get shares w), dx: (get dx w), dy: (get dy w),
        manager-x: (get manager-x w), manager-y: (get manager-y w), sender: tx-sender })
      (ok { shares: (get shares w), dx: (get dx w), dy: (get dy w) }))))

(define-public (pause-manager) (set-paused true))
(define-public (unpause-manager) (set-paused false))

(define-private (set-paused (paused bool))
  (let ((cfg (try! (loaded))))
    (asserts! (called-by (get client cfg)) ERR-NOT-CLIENT)
    (var-set config (merge cfg { manager-paused: paused }))
    (print { type: (if paused "pause-manager" "unpause-manager"), sender: tx-sender })
    (ok true)))

(define-public (add-liquidity (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (tick int) (max-x uint) (max-y uint) (min-price uint) (max-price uint) (deadline uint))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (try! (check-manager cfg deadline))
    (add-one (context token-x-trait token-y-trait cfg) { tick: tick, max-x: max-x, max-y: max-y, min-price: min-price, max-price: max-price })))

(define-public (remove-liquidity (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (tick int) (percent uint) (deadline uint))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (try! (check-manager cfg deadline))
    (remove-items token-x-trait token-y-trait cfg (list { tick: tick, percent: percent }))))

(define-public (rebalance (token-x-trait <ft-trait>) (token-y-trait <ft-trait>)
    (removes (list 64 { tick: int, percent: uint }))
    (adds (list 64 { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint })) (deadline uint))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (try! (check-manager cfg deadline))
    (let (
        (removed (try! (remove-items token-x-trait token-y-trait cfg removes)))
        (added (try! (fold add-iter adds (ok { ctx: (context token-x-trait token-y-trait cfg), results: (list) })))))
      (ok { removed: removed, added: (get results added) }))))

(define-public (harvest (token-x-trait <ft-trait>) (token-y-trait <ft-trait>))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (asserts! (called-by (get manager cfg)) ERR-NOT-MANAGER)
    (let ((w (try! (do-harvest token-x-trait token-y-trait cfg false))))
      (print { type: "harvest", shares: (get shares w), dx: (get dx w), dy: (get dy w), recipient: (get fee-recipient cfg), sender: tx-sender })
      (ok w))))

(define-private (loaded)
  (let ((cfg (var-get config)))
    (asserts! (get initialized cfg) ERR-NOT-INITIALIZED)
    (ok cfg)))

(define-private (called-by (who principal))
  (and (is-eq tx-sender who) (is-eq contract-caller who)))

(define-private (load (token-x-trait <ft-trait>) (token-y-trait <ft-trait>))
  (let ((cfg (try! (loaded))))
    (asserts! (and (is-eq (contract-of token-x-trait) (get token-x cfg)) (is-eq (contract-of token-y-trait) (get token-y cfg))) ERR-INVALID-TOKEN)
    (ok cfg)))

(define-private (check-manager (cfg { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
    client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool }) (deadline uint))
  (begin
    (asserts! (called-by (get manager cfg)) ERR-NOT-MANAGER)
    (asserts! (not (get manager-paused cfg)) ERR-MANAGER-PAUSED)
    (ok (asserts! (<= stacks-block-time deadline) ERR-EXPIRED))))

(define-private (check-iter (item { tick: int, percent: uint }) (acc (response { held: (list 64 int), last: (optional int) } uint)))
  (let (
      (a (try! acc))
      (tick (get tick item))
      (percent (get percent item)))
    (asserts! (match (get last a) prev (> tick prev) true) ERR-TICK-ORDER)
    (asserts! (is-some (index-of? (get held a) tick)) ERR-NOT-HELD)
    (asserts! (and (> percent u0) (<= percent ONE_8)) ERR-INVALID-PERCENT)
    (ok (merge a { last: (some tick) }))))

(define-private (principal-of (tick int))
  (default-to { n: u0, k: u0 } (map-get? bin-principal tick)))

(define-private (bin-state (pool-id uint) (tick int))
  (let ((b (try! (contract-call? .clmm-pool-v1 get-bin-state pool-id tick))))
    (ok { x: (get balance-x b), y: (get balance-y b), s: (get total-supply b), l: (get liquidity b),
      h: (contract-call? .clmm-lp-token-v1 get-balance-or-default (+ (* pool-id TOKEN-ID-MOD) (to-uint (+ tick TOKEN-ID-OFFSET))) current-contract) })))

(define-private (split-shares (st { x: uint, y: uint, s: uint, l: uint, h: uint }) (p { n: uint, k: uint }) (phi uint))
  (let ((h (get h st)) (l (get l st)))
    (if (or (is-eq h u0) (is-eq l u0))
      (ok { c: h, m: u0 })
      (let ((c (+ (try! (mul-div-up (get n p) (- ONE_8 phi) ONE_8))
                  (try! (mul-div-up (try! (mul-div-up (get k p) (get s st) l)) phi ONE_8)))))
        (ok (if (< c h) { c: c, m: (- h c) } { c: h, m: u0 }))))))

(define-private (l-error (l uint)) (+ (bit-shift-right l u55) u2))

(define-private (context (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (cfg { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
    client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool }))
  { tx: token-x-trait, ty: token-y-trait, pool-id: (get pool-id cfg), token-x: (get token-x cfg), token-y: (get token-y cfg),
    native-x: (get native-x cfg), native-y: (get native-y cfg) })

(define-private (add-iter (spec { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint })
    (acc (response { ctx: { tx: <ft-trait>, ty: <ft-trait>, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool },
      results: (list 64 { tick: int, dx: uint, dy: uint, shares: uint }) } uint)))
  (let (
      (a (try! acc))
      (r (try! (add-one (get ctx a) spec))))
    (ok (merge a { results: (unwrap! (as-max-len? (append (get results a) r) u64) ERR-TOO-MANY-BINS) }))))

(define-private (add-one (ctx { tx: <ft-trait>, ty: <ft-trait>, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool })
    (spec { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint }))
  (let (
      (pool-id (get pool-id ctx))
      (tick (get tick spec))
      (held-now (var-get held))
      (known (is-some (index-of? held-now tick)))
      (i (var-get idle))
      (before (try! (bin-state pool-id tick)))
      (amounts (try! (in-ratio before (min (get max-x spec) (get x i)) (min (get max-y spec) (get y i)))))
      (dx (get dx amounts))
      (dy (get dy amounts))
      (p (principal-of tick))
      (v0 (if (> (get h before) u0) (try! (mul-div (get h before) (get l before) (get s before))) u0))
      (n0 (if (> (get n p) u0) (try! (mul-div-up (get n p) (get l before) (get s before))) u0)))
    (asserts! (or (> dx u0) (> dy u0)) ERR-INVALID-AMOUNT)
    (asserts! (or known (< (len held-now) MAX-BINS)) ERR-TOO-MANY-BINS)
    (let (
        (r (try! (pool-add ctx tick dx dy (get min-price spec) (get max-price spec))))
        (after (try! (bin-state pool-id tick)))
        (v1 (try! (mul-div (get h after) (get l after) (get s after)))))
      (asserts! (and
        (<= (get fee-x r) (+ (bit-shift-right (get x after) FEE-SHIFT) FEE-DUST))
        (<= (get fee-y r) (+ (bit-shift-right (get y after) FEE-SHIFT) FEE-DUST))) ERR-DEPOSIT-FEE)
      (asserts! (>= v1 v0) ERR-VALUE-FELL)
      (let (
          (dv (- v1 v0))
          (n (try! (mul-div-up (+ n0 dv) (get s after) (get l after))))
          (k (+ (get k p) dv (l-error (get l after)))))
        (map-set bin-principal tick { n: n, k: k })
        (var-set idle { x: (- (get x i) dx), y: (- (get y i) dy) })
        (or known (var-set held (unwrap! (as-max-len? (append held-now tick) u64) ERR-TOO-MANY-BINS)))
        (print { type: "add-liquidity", tick: tick, dx: dx, dy: dy, shares: (get shares r), fee-x: (get fee-x r), fee-y: (get fee-y r),
          n: n, k: k, idle-x: (- (get x i) dx), idle-y: (- (get y i) dy) })
        (ok { tick: tick, dx: dx, dy: dy, shares: (get shares r) })))))

(define-private (in-ratio (st { x: uint, y: uint, s: uint, l: uint, h: uint }) (bx uint) (by uint))
  (let ((x (get x st)) (y (get y st)))
    (if (or (is-eq (get s st) u0) (and (is-eq x u0) (is-eq y u0)))
      (ok { dx: bx, dy: by })
      (if (is-eq x u0)
        (ok { dx: u0, dy: by })
        (if (is-eq y u0)
          (ok { dx: bx, dy: u0 })
          (match (mul-div bx y x)
            dy (if (<= dy by) (ok { dx: bx, dy: dy }) (ok { dx: (try! (mul-div by x y)), dy: by }))
            overflow (ok { dx: (try! (mul-div by x y)), dy: by })))))))

(define-private (pool-add (ctx { tx: <ft-trait>, ty: <ft-trait>, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool })
    (tick int) (dx uint) (dy uint) (min-price uint) (max-price uint))
  (let ((tx (get tx ctx)) (ty (get ty ctx)) (pool-id (get pool-id ctx)) (ax (get token-x ctx)) (ay (get token-y ctx)))
    (if (get native-x ctx)
      (if (get native-y ctx)
        (as-contract? ((with-stx (+ dx dy)))
          (try! (contract-call? .clmm-pool-v1 add-to-position tx ty pool-id tick dx dy min-price max-price u0)))
        (as-contract? ((with-stx dx) (with-ft ay "*" dy))
          (try! (contract-call? .clmm-pool-v1 add-to-position tx ty pool-id tick dx dy min-price max-price u0))))
      (if (get native-y ctx)
        (as-contract? ((with-ft ax "*" dx) (with-stx dy))
          (try! (contract-call? .clmm-pool-v1 add-to-position tx ty pool-id tick dx dy min-price max-price u0)))
        (as-contract? ((with-ft ax "*" dx) (with-ft ay "*" dy))
          (try! (contract-call? .clmm-pool-v1 add-to-position tx ty pool-id tick dx dy min-price max-price u0)))))))

(define-private (remove-items (token-x-trait <ft-trait>) (token-y-trait <ft-trait>)
    (cfg { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
      client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool })
    (items (list 64 { tick: int, percent: uint })))
  (let ((held-now (var-get held)))
    (try! (fold check-iter items (ok { held: held-now, last: none })))
    (let (
        (w (try! (burn token-x-trait token-y-trait (get pool-id cfg) (get manager-fee cfg) held-now items)))
        (i (var-get idle)))
      (var-set idle { x: (+ (get x i) (get dx w)), y: (+ (get y i) (get dy w)) })
      (print { type: "remove-liquidity", items: items, shares: (get shares w), dx: (get dx w), dy: (get dy w),
        manager-x: (get manager-x w), manager-y: (get manager-y w), idle-x: (+ (get x i) (get dx w)), idle-y: (+ (get y i) (get dy w)) })
      (ok w))))

(define-private (at-percent (tick int) (acc { percent: uint, items: (list 64 { tick: int, percent: uint }) }))
  (merge acc { items: (default-to (get items acc) (as-max-len? (append (get items acc) { tick: tick, percent: (get percent acc) }) u64)) }))

(define-private (burn (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (phi uint) (held-now (list 64 int))
    (items (list 64 { tick: int, percent: uint })))
  (let (
      (w (try! (fold burn-iter items (ok { pool-id: pool-id, phi: phi, burn: u0, ox: u0, oy: u0, mx: u0, my: u0, items: (list), emptied: (list) }))))
      (o (var-get owed)))
    (try! (pool-burn token-x-trait token-y-trait pool-id (get ox w) (get oy w) (get items w)))
    (var-set owed { x: (+ (get x o) (get mx w)), y: (+ (get y o) (get my w)) })
    (and (> (len (get emptied w)) u0)
      (var-set held (get out (fold keep-iter held-now { drop: (get emptied w), out: (list) }))))
    (ok { shares: (get burn w), dx: (- (get ox w) (get mx w)), dy: (- (get oy w) (get my w)), manager-x: (get mx w), manager-y: (get my w) })))

(define-private (burn-iter (item { tick: int, percent: uint })
    (acc (response { pool-id: uint, phi: uint, burn: uint, ox: uint, oy: uint, mx: uint, my: uint,
      items: (list 64 { tick: int, percent: uint }), emptied: (list 64 int) } uint)))
  (let (
      (a (try! acc))
      (tick (get tick item))
      (st (try! (bin-state (get pool-id a) tick)))
      (h (get h st))
      (sh (try! (mul-div h (get percent item) ONE_8)))
      (left (- h sh)))
    (if (is-eq sh u0)
      (if (is-eq left u0)
        (begin
          (map-delete bin-principal tick)
          (ok (merge a { emptied: (unwrap! (as-max-len? (append (get emptied a) tick) u64) ERR-TOO-MANY-BINS) })))
        (ok a))
      (let (
          (p (principal-of tick))
          (m (get m (try! (split-shares st p (get phi a)))))
          (ox (try! (mul-div (get x st) sh (get s st))))
          (oy (try! (mul-div (get y st) sh (get s st))))
          (mx (try! (mul-div ox m h)))
          (my (try! (mul-div oy m h)))
          (n (try! (mul-div-up (get n p) left h)))
          (k (try! (mul-div-up (get k p) left h))))
        (if (is-eq left u0) (map-delete bin-principal tick) (map-set bin-principal tick { n: n, k: k }))
        (print { type: "remove-bin", tick: tick, shares: sh, dx: (- ox mx), dy: (- oy my), manager-x: mx, manager-y: my, n: n, k: k })
        (ok (merge a {
          burn: (add-shares (get burn a) sh),
          ox: (+ (get ox a) ox),
          oy: (+ (get oy a) oy),
          mx: (+ (get mx a) mx),
          my: (+ (get my a) my),
          items: (unwrap! (as-max-len? (append (get items a) item) u64) ERR-TOO-MANY-BINS),
          emptied: (if (is-eq left u0) (unwrap! (as-max-len? (append (get emptied a) tick) u64) ERR-TOO-MANY-BINS) (get emptied a)) }))))))

(define-private (keep-iter (tick int) (acc { drop: (list 64 int), out: (list 64 int) }))
  (if (is-some (index-of? (get drop acc) tick))
    acc
    (merge acc { out: (default-to (get out acc) (as-max-len? (append (get out acc) tick) u64)) })))

(define-private (add-shares (total uint) (shares uint))
  (if (> shares (- MAX-U128 total)) MAX-U128 (+ total shares)))

(define-private (pool-burn (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (ox uint) (oy uint)
    (items (list 64 { tick: int, percent: uint })))
  (if (is-eq (len items) u0)
    (ok true)
    (let ((out (try! (as-contract? ()
            (try! (contract-call? .clmm-pool-v1 reduce-positions token-x-trait token-y-trait pool-id items u0 u0))))))
      (ok (asserts! (and (is-eq (get dx out) ox) (is-eq (get dy out) oy)) ERR-POOL-MISMATCH)))))

(define-private (do-harvest (token-x-trait <ft-trait>) (token-y-trait <ft-trait>)
    (cfg { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
      client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool })
    (restart bool))
  (let (
      (w (try! (fold harvest-iter (var-get held)
        (ok { pool-id: (get pool-id cfg), phi: (get manager-fee cfg), restart: restart, burn: u0, ox: u0, oy: u0, items: (list) }))))
      (o (var-get owed))
      (dx (+ (get x o) (get ox w)))
      (dy (+ (get y o) (get oy w))))
    (try! (pool-burn token-x-trait token-y-trait (get pool-id cfg) (get ox w) (get oy w) (get items w)))
    (var-set owed { x: u0, y: u0 })
    (try! (pay token-x-trait (get token-x cfg) (get native-x cfg) dx (get fee-recipient cfg)))
    (try! (pay token-y-trait (get token-y cfg) (get native-y cfg) dy (get fee-recipient cfg)))
    (ok { shares: (get burn w), dx: dx, dy: dy })))

(define-private (harvest-iter (tick int)
    (acc (response { pool-id: uint, phi: uint, restart: bool, burn: uint, ox: uint, oy: uint, items: (list 64 { tick: int, percent: uint }) } uint)))
  (let (
      (a (try! acc))
      (st (try! (bin-state (get pool-id a) tick)))
      (h (get h st))
      (p (principal-of tick))
      (sp (try! (split-shares st p (get phi a))))
      (c (get c sp))
      (m (get m sp))
      (percent (if (is-eq m u0) u0 (try! (mul-div m ONE_8 h))))
      (sh (try! (mul-div h percent ONE_8)))
      (q (if (get restart a)
        { n: c, k: (if (is-eq c u0) u0 (+ (try! (mul-div c (get l st) (get s st))) (l-error (get l st)))) }
        p))
      (ox (if (is-eq sh u0) u0 (try! (mul-div (get x st) sh (get s st)))))
      (oy (if (is-eq sh u0) u0 (try! (mul-div (get y st) sh (get s st))))))
    (and (get restart a) (map-set bin-principal tick q))
    (if (or (get restart a) (> sh u0))
      (begin (print { type: "harvest-bin", tick: tick, shares: sh, dx: ox, dy: oy, n: (get n q), k: (get k q) }) true)
      true)
    (if (is-eq sh u0)
      (ok a)
      (ok (merge a {
        burn: (add-shares (get burn a) sh),
        ox: (+ (get ox a) ox),
        oy: (+ (get oy a) oy),
        items: (unwrap! (as-max-len? (append (get items a) { tick: tick, percent: percent }) u64) ERR-TOO-MANY-BINS) })))))

(define-private (pull (token <ft-trait>) (asset principal) (is-stx bool) (amount uint) (owner principal))
  (if (is-eq amount u0)
    (ok true)
    (if is-stx
      (restrict-assets? owner ((with-stx amount)) (try! (pull-checked token amount owner)))
      (restrict-assets? owner ((with-ft asset "*" amount)) (try! (pull-checked token amount owner))))))

(define-private (pull-checked (token <ft-trait>) (amount uint) (owner principal))
  (let ((before (try! (contract-call? token get-balance current-contract))))
    (try! (contract-call? token transfer amount owner current-contract none))
    (ok (asserts! (is-eq (try! (contract-call? token get-balance current-contract)) (+ before amount)) ERR-TRANSFER-MISMATCH))))

(define-private (pay (token <ft-trait>) (asset principal) (is-stx bool) (amount uint) (recipient principal))
  (if (is-eq amount u0)
    (ok true)
    (if is-stx
      (as-contract? ((with-stx amount))
        (try! (contract-call? token transfer amount tx-sender recipient none)))
      (as-contract? ((with-ft asset "*" amount))
        (try! (contract-call? token transfer amount tx-sender recipient none))))))

(define-private (min (a uint) (b uint)) (if (< a b) a b))

(define-private (fits (r uint) (x uint) (c uint) (d1 uint) (d0 uint))
  (let (
      (p0 (* c d0))
      (u (+ (* c d1) (bit-shift-right p0 u64)))
      (l (bit-and p0 M64)))
    (or (> r u) (and (is-eq r u) (>= x l)))))

(define-private (q-digit (r uint) (x uint) (d1 uint) (d0 uint))
  (let (
      (e (/ r d1))
      (c0 (if (> e M64) M64 e)))
    (if (fits r x c0 d1 d0)
      c0
      (if (fits r x (- c0 u1) d1 d0) (- c0 u1) (- c0 u2)))))

(define-private (r-digit (r uint) (x uint) (c uint) (d1 uint) (d0 uint))
  (let (
      (p0 (* c d0))
      (u (+ (* c d1) (bit-shift-right p0 u64)))
      (l (bit-and p0 M64))
      (dr (- r u)))
    (if (>= x l)
      (+ (bit-shift-left dr u64) (- x l))
      (+ (bit-shift-left (- dr u1) u64) (- (+ x TWO64) l)))))

(define-private (finish (q uint) (r uint) (up bool))
  (if (and up (> r u0))
    (if (< q MAX-U128) (ok (+ q u1)) ERR-MATH-OVERFLOW)
    (ok q)))

(define-private (slow-div (a uint) (b uint) (d uint) (up bool))
  (let (
      (a1 (bit-shift-right a u64)) (a0 (bit-and a M64))
      (b1 (bit-shift-right b u64)) (b0 (bit-and b M64))
      (p00 (* a0 b0)) (p01 (* a0 b1)) (p10 (* a1 b0)) (p11 (* a1 b1))
      (mid (+ (bit-and p01 M64) (bit-and p10 M64) (bit-shift-right p00 u64)))
      (hi (+ p11 (bit-shift-right p01 u64) (bit-shift-right p10 u64) (bit-shift-right mid u64)))
      (lo (bit-or (bit-shift-left (bit-and mid M64) u64) (bit-and p00 M64))))
    (if (>= hi d)
      ERR-MATH-OVERFLOW
      (if (< d TWO64)
        (let (
            (w1 (+ (bit-shift-left hi u64) (bit-shift-right lo u64)))
            (w2 (+ (bit-shift-left (mod w1 d) u64) (bit-and lo M64))))
          (finish (+ (bit-shift-left (/ w1 d) u64) (/ w2 d)) (mod w2 d) up))
        (let (
            (s (- u127 (log2 d)))
            (dn (bit-shift-left d s))
            (d1 (bit-shift-right dn u64))
            (d0 (bit-and dn M64))
            (h (+ (bit-shift-left hi s) (bit-shift-right (bit-shift-right lo u1) (- u127 s))))
            (ln (bit-shift-left lo s))
            (ln1 (bit-shift-right ln u64))
            (ln0 (bit-and ln M64))
            (q1 (q-digit h ln1 d1 d0))
            (r1 (r-digit h ln1 q1 d1 d0))
            (q0 (q-digit r1 ln0 d1 d0))
            (r2 (if up (r-digit r1 ln0 q0 d1 d0) u0)))
          (finish (+ (bit-shift-left q1 u64) q0) r2 up))))))

(define-read-only (mul-div (a uint) (b uint) (d uint))
  (begin
    (asserts! (> d u0) ERR-MATH-OVERFLOW)
    (if (or (is-eq a u0) (is-eq b u0))
      (ok u0)
      (if (<= a (/ MAX-U128 b))
        (ok (/ (* a b) d))
        (slow-div a b d false)))))

(define-read-only (mul-div-up (a uint) (b uint) (d uint))
  (begin
    (asserts! (> d u0) ERR-MATH-OVERFLOW)
    (if (or (is-eq a u0) (is-eq b u0))
      (ok u0)
      (if (<= a (/ MAX-U128 b))
        (let ((p (* a b)))
          (ok (+ (/ p d) (if (> (mod p d) u0) u1 u0))))
        (slow-div a b d true)))))
