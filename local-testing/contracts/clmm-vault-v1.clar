;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;;
;; clmm-vault-v1 - Zest CLMM managed liquidity for one client
;;
;; The vault holds one client's liquidity in that client's private pool of
;; clmm-pool-v1, whose only depositor it is. The manager places the liquidity
;; in bins; the client deposits and withdraws at any time, also when the
;; manager or the pool is paused, and can pause the manager. Each vault is
;; configured once by governance.
;;
;; Fee cut. The manager earns
;; `manager-fee` (phi, ONE_8 units) of the growth of the client's liquidity
;; per share; the client keeps its principal and the rest. Per bin the vault
;; keeps N, the shares the client's principal would be with no manager, and
;; K, that principal as liquidity. With h the vault's shares in the bin, S the
;; bin's share supply and L its rounded liquidity (pi = L / S):
;;     client shares c = (1 - phi) N + phi K / pi,   manager shares m = h - c
;; so both depend only on how much pi grew, never on when anyone harvested.
;;  * an add moves N and K so that the client's value grows by exactly what
;;    the vault's value grew: a deposit fee the vault pays into its own bin
;;    goes to the client;
;;  * a removal pays the manager m/h of the tokens that leave the bin, as
;;    `owed`, and scales N and K by the shares left;
;;  * a harvest burns m and leaves N and K, so the manager's unpaid slice
;;    keeps earning for the manager until it is harvested.
;; Every product is one mul-div whose result fits 128 bits, and every
;; rounding favours the client. The vault carries its own copy of the pool's
;; mul-div and reads each bin once (get-bin-state): every contract call loads
;; the callee's whole source.
;;
;; Tokens leave the vault only to the client or the fee recipient. Burns run
;; in `as-contract?` with no allowance, so nothing the vault holds can leave
;; during the pool call (LP shares are not a native asset: only their owner,
;; calling the LP token or the pool itself, can move or redeem them); payouts
;; run in a separate `as-contract?` capped at the payout. Withdrawals never
;; pay the fee recipient: the manager's part of what leaves a bin waits in
;; `owed` for `harvest`, so an exit does not depend on that address. The
;; vault tracks at most 64 bins (`held`); LP shares anyone sends it for other
;; bins are ignored, and shares sent for a tracked bin count as the manager's.
;; Tokens anyone sends it are not counted: idle plus owed may be below the
;; vault's balance.
;;
;; Trust: the manager decides where the liquidity sits, so a misused manager
;; key, or a manager governance installs, can lose the principal to arbitrage
;; in one block. Pausing the manager and withdrawing protect the client only
;; against slow harm.

(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; ------------------------------------------------------------------ errors --

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

;; --------------------------------------------------------------- constants --

(define-constant ONE_8 u100000000) ;; fees and percentages
(define-constant MAX-U128 u340282366920938463463374607431768211455) ;; 2^128 - 1
(define-constant M64 u18446744073709551615) ;; 2^64 - 1
(define-constant TWO64 u18446744073709551616) ;; 2^64
(define-constant TOKEN-ID-MOD u18446744073709551616) ;; 2^64
(define-constant TOKEN-ID-OFFSET 4294967296) ;; 2^32
(define-constant MAX-BINS u64)
;; An add's deposit fee is dust when it is at most 2^-40 of the bin's reserve
;; of that token plus 16 units. The add rounds the token that does not bind
;; down by under one raw unit, and the deposit swaps the binding token for
;; it, so the fee is about f / (1 - f) of one raw unit of the other token,
;; counted in raw units of the binding one. When the dearer raw unit binds
;; the fee stays within the dust bound. When the cheaper one binds it is about
;; P f / (1 - f) (or f / ((1 - f) P)), with P the bin's price in raw X per raw
;; Y, and such an add fails with ERR-DEPOSIT-FEE unless 2^-40 of the reserve
;; covers it.
(define-constant FEE-SHIFT u40)
(define-constant FEE-DUST u16)

;; ----------------------------------------------------------------- storage --

;; set once by `initialize`, from the pool's record where it can: pool, tokens
;; and their native-STX flags; then the roles, phi and the manager pause
(define-data-var config { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
  client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool }
  { initialized: false, pool-id: u0, token-x: current-contract, token-y: current-contract, native-x: false, native-y: false,
    client: current-contract, manager: current-contract, fee-recipient: current-contract, manager-fee: u0, manager-paused: false })
;; the ticks the vault tracks, in the order it first added to them
(define-data-var held (list 64 int) (list))
;; the client's tokens outside the bins
(define-data-var idle { x: uint, y: uint } { x: u0, y: u0 })
;; the manager's cut already turned into tokens, paid by `harvest`
(define-data-var owed { x: uint, y: uint } { x: u0, y: u0 })
;; the client's principal per tracked bin: n shares, k liquidity
(define-map bin-principal int { n: uint, k: uint })

(define-read-only (is-dao-or-extension)
  (ok (asserts! (or (is-eq tx-sender .executor-dao) (contract-call? .executor-dao is-extension contract-caller)) ERR-NOT-AUTHORIZED)))

;; ------------------------------------------------------------ read-only API --

(define-read-only (get-config) (var-get config))
(define-read-only (get-totals) { idle: (var-get idle), owed: (var-get owed), held: (var-get held) })
(define-read-only (get-principal (tick int)) (principal-of tick))

;; A tracked bin now: the client's principal (n, k), the vault's shares and
;; their split, and the tokens a full withdrawal of the bin would pay each.
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

;; ------------------------------------------------------------- governance --

;; Configures the vault once, for a private pool that names it as depositor.
;; clmm-vault-public-v1 is this contract without that check, for a public pool.
;; The tokens and their native-STX flags are copied from the pool's record.
;; Neither the client nor the fee recipient, the only addresses the vault
;; pays, may be the vault itself or the DAO: the DAO never holds listed
;; tokens or LP shares, since a token it moves in a proposal runs with the
;; DAO's full authority (docs/dao.md, Treasury).
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

;; Harvests at the old phi (as `harvest`, paying the fee recipient), restarts
;; every bin's principal at the client's current value, then sets the new phi,
;; which so applies only to growth from here on. The restart is not neutral,
;; even at an unchanged phi: the client's gains so far become principal, so
;; their later growth pays phi.
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

;; ----------------------------------------------------------------- client --

;; Pulls tokens into idle. The balance delta proves the vault received exactly
;; the amounts, as in the pool's transfer-in.
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

;; Takes `percent` (ONE_8 = 100%) of the client's position from every
;; tracked bin and from idle, in one batched pool withdrawal, and pays it to
;; the client. The manager's part of what leaves the bins stays in `owed`.
;; Bins whose burn rounds to zero are skipped; at 100% every bin is burned
;; once and leaves the vault's books. The client's exits take no deadline:
;; they pay the client's share of the bins as they are when mined, with no
;; swap, so a late one gives no one anything, and min-dx and min-dy bound
;; what it pays.
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

;; The same for the listed bins only (strictly ascending, all tracked), so a
;; large position can leave over several transactions. Idle stays.
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

;; A plain flag: it blocks the manager's adds, removals and rebalances, and
;; nothing else. The positions keep earning and phi applies to that growth;
;; the client stops paying by withdrawing, which a pause allows.
(define-public (pause-manager) (set-paused true))
(define-public (unpause-manager) (set-paused false))

(define-private (set-paused (paused bool))
  (let ((cfg (try! (loaded))))
    (asserts! (called-by (get client cfg)) ERR-NOT-CLIENT)
    (var-set config (merge cfg { manager-paused: paused }))
    (print { type: (if paused "pause-manager" "unpause-manager"), sender: tx-sender })
    (ok true)))

;; ---------------------------------------------------------------- manager --
;; Every placement (add-liquidity, remove-liquidity, rebalance) takes a
;; trailing `deadline` in seconds and fails with ERR-EXPIRED once
;; stacks-block-time, the time of the block it is mined in, is past it, as
;; the pool's swaps do. The manager places liquidity at the market price
;; when it signs, which the bin's own state, and so min-price and max-price,
;; cannot see: an add mined late can sit at a price the market has left, for
;; the first trader to take. A removal is half of a rebalance, so it takes
;; the same check. harvest takes none: it burns only the manager's shares,
;; and its split does not depend on when it runs.

;; Adds from idle to bin `tick`, at most max-x and max-y (capped at idle). The
;; amounts follow the bin's token ratio at execution, and the add's deposit
;; fee must be dust, so moving liquidity in and out cannot feed the protocol's
;; share of fees. `min-price` and `max-price` bound the bin's price after the
;; add, as in add-to-position. It takes no min-shares: the dust check bounds
;; the deposit fee at every rate the pool allows, so a fee change mined
;; before the add costs at most that dust, whose rebated part goes to the
;; bin's shares (in the vault's own pool, the vault's).
(define-public (add-liquidity (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (tick int) (max-x uint) (max-y uint) (min-price uint) (max-price uint) (deadline uint))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (try! (check-manager cfg deadline))
    (add-one (context token-x-trait token-y-trait cfg) { tick: tick, max-x: max-x, max-y: max-y, min-price: min-price, max-price: max-price })))

;; Moves `percent` of the vault's shares in bin `tick` back to idle, less the
;; manager's part, which goes to `owed`.
(define-public (remove-liquidity (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (tick int) (percent uint) (deadline uint))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (try! (check-manager cfg deadline))
    (remove-items token-x-trait token-y-trait cfg (list { tick: tick, percent: percent }))))

;; Removals (one batched pool withdrawal), then adds from idle, for at most 8
;; bins each. Removal ticks must be strictly ascending and tracked.
(define-public (rebalance (token-x-trait <ft-trait>) (token-y-trait <ft-trait>)
    (removes (list 8 { tick: int, percent: uint }))
    (adds (list 8 { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint })) (deadline uint))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (try! (check-manager cfg deadline))
    (let (
        (removed (try! (remove-items token-x-trait token-y-trait cfg removes)))
        (added (try! (fold add-iter adds (ok { ctx: (context token-x-trait token-y-trait cfg), results: (list) })))))
      (ok { removed: removed, added: (get results added) }))))

;; Burns the manager's shares in every tracked bin and pays them, with
;; `owed`, to the fee recipient. Bins whose burn rounds to zero are skipped.
;; Allowed while the manager is paused: it only takes the manager's slice.
(define-public (harvest (token-x-trait <ft-trait>) (token-y-trait <ft-trait>))
  (let ((cfg (try! (load token-x-trait token-y-trait))))
    (asserts! (called-by (get manager cfg)) ERR-NOT-MANAGER)
    (let ((w (try! (do-harvest token-x-trait token-y-trait cfg false))))
      (print { type: "harvest", shares: (get shares w), dx: (get dx w), dy: (get dy w), recipient: (get fee-recipient cfg), sender: tx-sender })
      (ok w))))

;; ------------------------------------------------------------------ checks --

(define-private (loaded)
  (let ((cfg (var-get config)))
    (asserts! (get initialized cfg) ERR-NOT-INITIALIZED)
    (ok cfg)))

;; The client and the manager act only by calling the vault themselves
;; (tx-sender = contract-caller), as LP owners call the pool: no contract
;; either one calls, a pool token during a deposit included, acts for it. A
;; contract in either role calls the vault inside its own as-contract?.
;; deposit takes the check the exits take, so a client that could not
;; withdraw could never have deposited.
(define-private (called-by (who principal))
  (and (is-eq tx-sender who) (is-eq contract-caller who)))

;; the configuration, once each trait is checked against the vault's tokens
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

;; a caller's list of bins: strictly ascending ticks, all tracked, each with
;; a percentage in (0, 100%]
(define-private (check-iter (item { tick: int, percent: uint }) (acc (response { held: (list 64 int), last: (optional int) } uint)))
  (let (
      (a (try! acc))
      (tick (get tick item))
      (percent (get percent item)))
    (asserts! (match (get last a) prev (> tick prev) true) ERR-TICK-ORDER)
    (asserts! (is-some (index-of? (get held a) tick)) ERR-NOT-HELD)
    (asserts! (and (> percent u0) (<= percent ONE_8)) ERR-INVALID-PERCENT)
    (ok (merge a { last: (some tick) }))))

;; --------------------------------------------------------------- the books --

(define-private (principal-of (tick int))
  (default-to { n: u0, k: u0 } (map-get? bin-principal tick)))

;; the vault's shares and a bin's reserves, supply and rounded liquidity
(define-private (bin-state (pool-id uint) (tick int))
  (let ((b (try! (contract-call? .clmm-pool-v1 get-bin-state pool-id tick))))
    (ok { x: (get balance-x b), y: (get balance-y b), s: (get total-supply b), l: (get liquidity b),
      h: (contract-call? .clmm-lp-token-v1 get-balance-or-default (+ (* pool-id TOKEN-ID-MOD) (to-uint (+ tick TOKEN-ID-OFFSET))) current-contract) })))

;; c = (1 - phi) n + phi k s / l, at most h, rounded up; m = h - c
(define-private (split-shares (st { x: uint, y: uint, s: uint, l: uint, h: uint }) (p { n: uint, k: uint }) (phi uint))
  (let ((h (get h st)) (l (get l st)))
    (if (or (is-eq h u0) (is-eq l u0))
      (ok { c: h, m: u0 })
      (let ((c (+ (try! (mul-div-up (get n p) (- ONE_8 phi) ONE_8))
                  (try! (mul-div-up (try! (mul-div-up (get k p) (get s st) l)) phi ONE_8)))))
        (ok (if (< c h) { c: c, m: (- h c) } { c: h, m: u0 }))))))

;; the pool's error bound on a rounded liquidity: L <= exact <= L + l-error(L)
(define-private (l-error (l uint)) (+ (bit-shift-right l u55) u2))

;; ----------------------------------------------------------------- adds --

(define-private (context (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (cfg { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
    client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool }))
  { tx: token-x-trait, ty: token-y-trait, pool-id: (get pool-id cfg), token-x: (get token-x cfg), token-y: (get token-y cfg),
    native-x: (get native-x cfg), native-y: (get native-y cfg) })

(define-private (add-iter (spec { tick: int, max-x: uint, max-y: uint, min-price: uint, max-price: uint })
    (acc (response { ctx: { tx: <ft-trait>, ty: <ft-trait>, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool },
      results: (list 8 { tick: int, dx: uint, dy: uint, shares: uint }) } uint)))
  (let (
      (a (try! acc))
      (r (try! (add-one (get ctx a) spec))))
    (ok (merge a { results: (unwrap! (as-max-len? (append (get results a) r) u8) ERR-TOO-MANY-BINS) }))))

;; One add. With (h, L, S) before and after: v0 = h0 L0 / S0, n0 = N L0 / S0,
;; dv = h1 L1 / S1 - v0, then N = (n0 + dv) S1 / L1 and K += dv + l-error(L1).
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

;; The largest amounts within the budgets (bx, by) at the bin's token ratio:
;; the token that binds is spent in full and the other rounded down. A bin
;; holding one token takes only that token; a bin without supply takes both
;; budgets (its first deposit pays no fee).
(define-private (in-ratio (st { x: uint, y: uint, s: uint, l: uint, h: uint }) (bx uint) (by uint))
  (let ((x (get x st)) (y (get y st)))
    (if (or (is-eq (get s st) u0) (and (is-eq x u0) (is-eq y u0)))
      (ok { dx: bx, dy: by })
      (if (is-eq x u0)
        (ok { dx: u0, dy: by })
        (if (is-eq y u0)
          (ok { dx: bx, dy: u0 })
          ;; bx y / x beyond 2^128 exceeds any budget: Y binds
          (match (mul-div bx y x)
            dy (if (<= dy by) (ok { dx: bx, dy: dy }) (ok { dx: (try! (mul-div by x y)), dy: by }))
            overflow (ok { dx: (try! (mul-div by x y)), dy: by })))))))

;; add-to-position from the vault, with allowances equal to the amounts
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

;; ------------------------------------------------------------ removals --

;; the manager's removals: back to idle, the manager's part to owed
(define-private (remove-items (token-x-trait <ft-trait>) (token-y-trait <ft-trait>)
    (cfg { initialized: bool, pool-id: uint, token-x: principal, token-y: principal, native-x: bool, native-y: bool,
      client: principal, manager: principal, fee-recipient: principal, manager-fee: uint, manager-paused: bool })
    (items (list 8 { tick: int, percent: uint })))
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

;; Burns `percent` of the vault's shares in each listed bin (distinct ticks)
;; through one reduce-positions call, keeps the manager's part as owed and
;; returns the client's part. The books move bin by bin before the call, from
;; the same state and with the same roundings as the pool, which must pay
;; exactly the token totals. The shares total is a raw count, capped
;; (add-shares); each bin's event has its exact burn.
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

;; One bin of a burn: sh = h percent; the bin pays ox = x sh / S and
;; oy = y sh / S (as the pool computes them), of which m/h is the manager's;
;; N and K scale by (h - sh) / h, rounded up. A bin left without shares
;; leaves the books.
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

;; A shares total over bins is a raw count for the record: shares of
;; different bins differ in value, so the vault decides nothing on it (each
;; bin's event has its exact burn). Nor do they share a cap (seven bins of
;; 2^54 raw X at ticks -4458 to -4452, bin step 100, hold over 2^128), so it
;; stops at 2^128 - 1, as reduce-positions' does. Token totals need no cap:
;; they are at most what the pool holds.
(define-private (add-shares (total uint) (shares uint))
  (if (> shares (- MAX-U128 total)) MAX-U128 (+ total shares)))

;; one reduce-positions call for the bins that burn, as the vault and with no
;; allowance; the pool pays the vault, and its token totals must equal the
;; vault's
(define-private (pool-burn (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (ox uint) (oy uint)
    (items (list 64 { tick: int, percent: uint })))
  (if (is-eq (len items) u0)
    (ok true)
    (let ((out (try! (as-contract? ()
            (try! (contract-call? .clmm-pool-v1 reduce-positions token-x-trait token-y-trait pool-id items u0 u0))))))
      (ok (asserts! (and (is-eq (get dx out) ox) (is-eq (get dy out) oy)) ERR-POOL-MISMATCH)))))

;; ------------------------------------------------------------- harvest --

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

;; One bin of a harvest: burns m as a percentage of h, rounded down (so never
;; a client share); skipped when that burn rounds to zero. With `restart`
;; (set-manager-fee) the client's principal restarts at its value now:
;; N = c and K = c L / S + l-error(L), so c stays c under any new phi.
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
    ;; every restarted bin is reported, so its new N and K are on record
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

;; ------------------------------------------------------- token transfers --

;; Pull `amount` from `owner`. restrict-assets? stops the token from moving
;; anything else of theirs; the balance delta proves the vault received
;; exactly `amount`. Every call into the token, the balance reads included,
;; runs inside restrict-assets?: get-balance may be public code, which
;; outside it would run with the owner's unrestricted authority.
(define-private (pull (token <ft-trait>) (asset principal) (is-stx bool) (amount uint) (owner principal))
  (if (is-eq amount u0)
    (ok true)
    (if is-stx
      (restrict-assets? owner ((with-stx amount)) (try! (pull-checked token amount owner)))
      (restrict-assets? owner ((with-ft asset "*" amount)) (try! (pull-checked token amount owner))))))

;; pull's body, run inside its restrict-assets?
(define-private (pull-checked (token <ft-trait>) (amount uint) (owner principal))
  (let ((before (try! (contract-call? token get-balance current-contract))))
    (try! (contract-call? token transfer amount owner current-contract none))
    (ok (asserts! (is-eq (try! (contract-call? token get-balance current-contract)) (+ before amount)) ERR-TRANSFER-MISMATCH))))

;; Pay `amount` out of the vault. The allowance is the payout, so the token
;; cannot move more of it, nor any other token the vault holds. Delivery is
;; not checked: a token that under-delivers to the client would otherwise
;; lock the client's exit.
(define-private (pay (token <ft-trait>) (asset principal) (is-stx bool) (amount uint) (recipient principal))
  (if (is-eq amount u0)
    (ok true)
    (if is-stx
      (as-contract? ((with-stx amount))
        (try! (contract-call? token transfer amount tx-sender recipient none)))
      (as-contract? ((with-ft asset "*" amount))
        (try! (contract-call? token transfer amount tx-sender recipient none))))))

;; --------------------------------------------- mul-div (copy of the pool) --

(define-private (min (a uint) (b uint)) (if (< a b) a b))

;; c*D <= r*2^64 + x for 0 <= c < 2^64, with D = d1*2^64 + d0 (d1 < 2^64).
;; c*D = U*2^64 + L exactly (U, L below), so the comparison is lexicographic.
(define-private (fits (r uint) (x uint) (c uint) (d1 uint) (d0 uint))
  (let (
      (p0 (* c d0))
      (u (+ (* c d1) (bit-shift-right p0 u64)))
      (l (bit-and p0 M64)))
    (or (> r u) (and (is-eq r u) (>= x l)))))

;; floor((r*2^64 + x) / D) for r < D and D = d1*2^64 + d0 normalised (d1 >= 2^63).
;; The estimate c0 = floor(r/d1), capped at 2^64-1, is never below the quotient and
;; exceeds it by at most 2, so at most two downward tests are needed.
(define-private (q-digit (r uint) (x uint) (d1 uint) (d0 uint))
  (let (
      (e (/ r d1))
      (c0 (if (> e M64) M64 e)))
    (if (fits r x c0 d1 d0)
      c0
      (if (fits r x (- c0 u1) d1 d0) (- c0 u1) (- c0 u2)))))

;; remainder r*2^64 + x - c*D, for c = q-digit(r, x, d1, d0) (so the result is < D)
(define-private (r-digit (r uint) (x uint) (c uint) (d1 uint) (d0 uint))
  (let (
      (p0 (* c d0))
      (u (+ (* c d1) (bit-shift-right p0 u64)))
      (l (bit-and p0 M64))
      (dr (- r u)))
    (if (>= x l)
      (+ (bit-shift-left dr u64) (- x l))
      (+ (bit-shift-left (- dr u1) u64) (- (+ x TWO64) l)))))

;; the quotient q, or q + 1 when up is set and the remainder r is non-zero.
;; err u3006 only when that round-up would exceed 2^128 - 1 (q = 2^128 - 1, r > 0).
(define-private (finish (q uint) (r uint) (up bool))
  (if (and up (> r u0))
    (if (< q MAX-U128) (ok (+ q u1)) ERR-MATH-OVERFLOW)
    (ok q)))

;; floor(a*b/d) (up = false) or ceil(a*b/d) (up = true) for a*b > MAX-U128.
(define-private (slow-div (a uint) (b uint) (d uint) (up bool))
  (let (
      ;; 256-bit product a*b = hi*2^128 + lo from 64-bit limbs
      (a1 (bit-shift-right a u64)) (a0 (bit-and a M64))
      (b1 (bit-shift-right b u64)) (b0 (bit-and b M64))
      (p00 (* a0 b0)) (p01 (* a0 b1)) (p10 (* a1 b0)) (p11 (* a1 b1))
      (mid (+ (bit-and p01 M64) (bit-and p10 M64) (bit-shift-right p00 u64)))
      (hi (+ p11 (bit-shift-right p01 u64) (bit-shift-right p10 u64) (bit-shift-right mid u64)))
      (lo (bit-or (bit-shift-left (bit-and mid M64) u64) (bit-and p00 M64))))
    ;; the quotient fits in 128 bits iff hi < d
    (if (>= hi d)
      ERR-MATH-OVERFLOW
      (if (< d TWO64)
        ;; one-digit divisor: two native divisions (hi < d < 2^64, so no wrap)
        (let (
            (w1 (+ (bit-shift-left hi u64) (bit-shift-right lo u64)))
            (w2 (+ (bit-shift-left (mod w1 d) u64) (bit-and lo M64))))
          (finish (+ (bit-shift-left (/ w1 d) u64) (/ w2 d)) (mod w2 d) up))
        ;; two-digit divisor: normalise so that d << s has its top bit set (s = 127 - log2 d).
        ;; hi << s cannot lose bits (hi < d < 2^(128-s)); lo << s wraps, dropping exactly the
        ;; bits that moved into the high word. shift counts stay in [0, 127].
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
            ;; the final remainder is only needed to round up
            (r2 (if up (r-digit r1 ln0 q0 d1 d0) u0)))
          (finish (+ (bit-shift-left q1 u64) q0) r2 up))))))

;; floor(a*b/d) for any a, b, d whose result fits in 128 bits
(define-read-only (mul-div (a uint) (b uint) (d uint))
  (begin
    (asserts! (> d u0) ERR-MATH-OVERFLOW)
    (if (or (is-eq a u0) (is-eq b u0))
      (ok u0)
      (if (<= a (/ MAX-U128 b))
        (ok (/ (* a b) d))
        (slow-div a b d false)))))

;; ceil(a*b/d) for any a, b, d whose result fits in 128 bits
(define-read-only (mul-div-up (a uint) (b uint) (d uint))
  (begin
    (asserts! (> d u0) ERR-MATH-OVERFLOW)
    (if (or (is-eq a u0) (is-eq b u0))
      (ok u0)
      (if (<= a (/ MAX-U128 b))
        (let ((p (* a b)))
          (ok (+ (/ p d) (if (> (mod p d) u0) u1 u0))))
        (slow-div a b d true)))))
