(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-POOL-PAUSED (err u1001))
(define-constant ERR-POOL-SUNSET (err u1002))
(define-constant ERR-POOL-NOT-FOUND (err u1003))
(define-constant ERR-INVALID-PAIR (err u1004))
(define-constant ERR-TOKEN-LISTED (err u1005))
(define-constant ERR-NOT-DEPOSITOR (err u1006))
(define-constant ERR-PRIVATE-POOL (err u1007))
(define-constant ERR-PUBLIC-POOL (err u1008))

(define-constant ERR-POOL-ALREADY-EXISTS (err u2000))
(define-constant ERR-INVALID-PRICE (err u2001))
(define-constant ERR-INVALID-TOKEN-TRAIT (err u2002))
(define-constant ERR-INVALID-BIN-STEP (err u2003))
(define-constant ERR-PERCENT-GREATER-THAN-ONE (err u2004))
(define-constant ERR-ZERO-PERCENT (err u2005))
(define-constant ERR-INVALID-AMOUNT (err u2006))
(define-constant ERR-POSITION-NOT-FOUND (err u2007))
(define-constant ERR-PERCENT-GREATER-THAN-OR-EQUALS-ONE (err u2008))
(define-constant ERR-SLIPPAGE (err u2009))
(define-constant ERR-NOT-FILLED (err u2010))
(define-constant ERR-INVALID-ROUTE (err u2011))
(define-constant ERR-FEE-TOO-HIGH (err u2012))
(define-constant ERR-EXPIRED (err u2013))

(define-constant ERR-INVALID-LP-STATE (err u3002))
(define-constant ERR-MAX-POOLS-ALLOWED (err u3003))
(define-constant ERR-TICK-OUT-OF-RANGE (err u3004))
(define-constant ERR-AMOUNT-TOO-LARGE (err u3005))
(define-constant ERR-MATH-OVERFLOW (err u3006))
(define-constant ERR-TRANSFER-MISMATCH (err u3007))

(define-constant ONE u1152921504606846976)
(define-constant TWO-ONE u2305843009213693952)
(define-constant Q120 u1329227995784915872903807060280344576)
(define-constant M64 u18446744073709551615)
(define-constant TWO64 u18446744073709551616)
(define-constant MASK60 u1152921504606846975)
(define-constant ONE_8 u100000000)
(define-constant MAX-FEE-RATE u10000000)
(define-constant WAD u1000000000000000000)
(define-constant MAX-U128 u340282366920938463463374607431768211455)
(define-constant MAX-FRAME u332306998946228968225951765070086144)

(define-constant PRICE-SATURATION u295147905179352825856000000000000000000)
(define-constant FRAME-PRICE-SATURATION u18446744073709551616)
(define-constant MARGIN-SHIFT u40)
(define-constant MIN-LIQUIDITY u1000)
(define-constant TOKEN-ID-OFFSET 4294967296)
(define-constant TOKEN-ID-MOD u18446744073709551616)
(define-constant NOOP { in: u0, out: u0, fee: u0 })

(define-constant TABLE-100 { r: u1158671772221436761, max-tick: u4458,
  pows: (list { m: u1158671772221436761, e: u0 } { m: u1164450719652915446, e: u0 } { m: u1176095226849444600, e: u0 } { m: u1199734740909118437, e: u0 } { m: u1248448782326339691, e: u0 } { m: u1351891135575288268, e: u0 } { m: u1585198675837231519, e: u0 } { m: u2179554142962239670, e: u0 } { m: u2060181999868150888, e: u1 } { m: u1840693341056242148, e: u3 } { m: u1469376693153178349, e: u7 } { m: u1872692857019805960, e: u14 } { m: u1520909499354383083, e: u29 }) })
(define-constant TABLE-500 { r: u1181392989472242326, max-tick: u909,
  pows: (list { m: u1181392989472242326, e: u0 } { m: u1210567579837189325, e: u0 } { m: u1271095958829048791, e: u0 } { m: u1401383294609026292, e: u0 } { m: u1703390153242862764, e: u0 } { m: u1258341527402676493, e: u1 } { m: u1373400871836506805, e: u2 } { m: u1636043691807529010, e: u4 } { m: u1160807110808449453, e: u9 } { m: u1168746651978667122, e: u18 }) })
(define-constant TABLE-1000 { r: u1209194275277305247, max-tick: u465,
  pows: (list { m: u1209194275277305247, e: u0 } { m: u1268213655067531674, e: u0 } { m: u1395035020574284841, e: u0 } { m: u1687992374894884658, e: u0 } { m: u1235694818041800314, e: u1 } { m: u1324410792264694632, e: u2 } { m: u1521407953324057614, e: u4 } { m: u2007666741567994363, e: u8 } { m: u1748048643854877651, e: u17 }) })
(define-constant TABLE-2000 { r: u1262962230211932762, max-tick: u243,
  pows: (list { m: u1262962230211932762, e: u0 } { m: u1383505805528216371, e: u0 } { m: u1660206966633859645, e: u0 } { m: u1195349015976378945, e: u1 } { m: u1239337859764309690, e: u2 } { m: u1332231487146170102, e: u4 } { m: u1539428944860324327, e: u8 } { m: u2055509821617822438, e: u16 }) })

(define-data-var pool-id-nonce uint u0)

(define-map pools uint { token-x: principal, token-y: principal, bin-step: uint, fee-rate-x: uint, fee-rate-y: uint, fee-rebate: uint, sunset: bool, paused: bool, native-x: bool, native-y: bool, depositor: (optional principal), discounts: uint })

(define-map pool-id-by-token { token-x: principal, token-y: principal, bin-step: uint } uint)

(define-map fee-discounts { pool-id: uint, who: principal } uint)

(define-map bins { pool-id: uint, tick: int } { balance-x: uint, balance-y: uint, total-supply: uint, a: uint, b: uint, cu: uint, cd4: uint, e: int })

(define-map pool-fees uint { fee-x: uint, fee-y: uint })

(define-map native-stx-tokens principal bool)

(define-map listed-tokens principal bool)

(define-read-only (is-dao-or-extension)
  (ok (asserts! (or (is-eq tx-sender .executor-dao) (contract-call? .executor-dao is-extension contract-caller)) ERR-NOT-AUTHORIZED)))

(define-private (check-fees (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint))
  (begin
    (asserts! (and (< fee-rate-x ONE_8) (< fee-rate-y ONE_8)) ERR-PERCENT-GREATER-THAN-OR-EQUALS-ONE)
    (ok (asserts! (<= fee-rebate ONE_8) ERR-PERCENT-GREATER-THAN-ONE))))

(define-private (check-pool-fees (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint))
  (begin
    (try! (check-fees fee-rate-x fee-rate-y fee-rebate))
    (ok (asserts! (and (<= fee-rate-x MAX-FEE-RATE) (<= fee-rate-y MAX-FEE-RATE)) ERR-FEE-TOO-HIGH))))

(define-private (discount-of (pool-id uint) (discounts uint) (who principal))
  (if (is-eq discounts u0) u0 (default-to u0 (map-get? fee-discounts { pool-id: pool-id, who: who }))))

(define-private (discounted (fee-rate uint) (discount uint))
  (- fee-rate (/ (* fee-rate discount) ONE_8)))

(define-read-only (get-pool-count) (var-get pool-id-nonce))
(define-read-only (get-pool-id (key { token-x: principal, token-y: principal, bin-step: uint })) (map-get? pool-id-by-token key))
(define-read-only (get-pool (pool-id uint)) (map-get? pools pool-id))
(define-read-only (get-pool-balances (pool-id uint) (tick int)) (map-get? bins { pool-id: pool-id, tick: tick }))
(define-read-only (get-pool-fees (pool-id uint)) (default-to { fee-x: u0, fee-y: u0 } (map-get? pool-fees pool-id)))
(define-read-only (get-fee-discount (pool-id uint) (who principal)) (default-to u0 (map-get? fee-discounts { pool-id: pool-id, who: who })))

(define-read-only (get-fee-rates (pool-id uint) (who principal))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (discount (discount-of pool-id (get discounts pool) who)))
    (ok { fee-rate-x: (discounted (get fee-rate-x pool) discount), fee-rate-y: (discounted (get fee-rate-y pool) discount) })))
(define-read-only (is-native-stx-token (token principal)) (default-to false (map-get? native-stx-tokens token)))
(define-read-only (is-listed-token (token principal)) (default-to false (map-get? listed-tokens token)))

(define-read-only (get-liquidity-token-id (pool-id uint) (tick int))
  (+ (* pool-id TOKEN-ID-MOD) (to-uint (+ tick TOKEN-ID-OFFSET))))
(define-read-only (parse-liquidity-token-id (token-id uint))
  { pool-id: (/ token-id TOKEN-ID-MOD), tick: (- (to-int (mod token-id TOKEN-ID-MOD)) TOKEN-ID-OFFSET) })

(define-read-only (get-sqrt-price (bin-step uint) (tick int))
  (sqrt-price (try! (bin-table bin-step)) tick))

(define-read-only (get-bin-price (pool-id uint) (tick int))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (bal (get bin lb))
      (fr (get fr lb)))
    (bin-price-wad fr (get balance-x bal) (get balance-y bal))))

(define-read-only (get-bin-state (pool-id uint) (tick int))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (bal (get bin lb))
      (fr (get fr lb)))
    (ok { balance-x: (get balance-x bal), balance-y: (get balance-y bal), total-supply: (get total-supply bal),
      liquidity: (try! (liquidity fr (try! (to-frame (get balance-x bal) (get sx fr))) (try! (to-frame (get balance-y bal) (get sy fr))))) })))

(define-read-only (simulate-swap-x-for-y (bin-step uint) (tick int) (x uint) (y uint) (dx uint) (fee-rate uint) (max-price uint))
  (begin
    (asserts! (< fee-rate ONE_8) ERR-PERCENT-GREATER-THAN-OR-EQUALS-ONE)
    (step-x-for-y (try! (frame bin-step tick)) x y dx fee-rate max-price)))

(define-read-only (simulate-swap-y-for-x (bin-step uint) (tick int) (x uint) (y uint) (dy uint) (fee-rate uint) (min-price uint))
  (begin
    (asserts! (< fee-rate ONE_8) ERR-PERCENT-GREATER-THAN-OR-EQUALS-ONE)
    (step-y-for-x (try! (frame bin-step tick)) x y dy fee-rate min-price)))

(define-read-only (simulate-deposit (bin-step uint) (tick int) (x uint) (y uint) (supply uint) (dx uint) (dy uint) (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint))
  (begin
    (try! (check-fees fee-rate-x fee-rate-y fee-rebate))
    (deposit (try! (frame bin-step tick)) x y supply dx dy fee-rate-x fee-rate-y fee-rebate)))

(define-read-only (get-bin-liquidity (bin-step uint) (tick int) (x uint) (y uint))
  (let ((fr (try! (frame bin-step tick))))
    (liquidity fr (try! (to-frame x (get sx fr))) (try! (to-frame y (get sy fr))))))

(define-read-only (get-frame (bin-step uint) (tick int))
  (frame bin-step tick))

(define-read-only (quote-swap-x-for-y (pool-id uint) (tick int) (dx uint) (max-price uint))
  (quote-x-for-y pool-id tick dx max-price none))
(define-read-only (quote-swap-x-for-y-as (pool-id uint) (tick int) (dx uint) (max-price uint) (who principal))
  (quote-x-for-y pool-id tick dx max-price (some who)))

(define-read-only (quote-swap-y-for-x (pool-id uint) (tick int) (dy uint) (min-price uint))
  (quote-y-for-x pool-id tick dy min-price none))
(define-read-only (quote-swap-y-for-x-as (pool-id uint) (tick int) (dy uint) (min-price uint) (who principal))
  (quote-y-for-x pool-id tick dy min-price (some who)))

(define-read-only (quote-add-to-position (pool-id uint) (tick int) (dx uint) (dy uint))
  (quote-add pool-id tick dx dy none))
(define-read-only (quote-add-to-position-as (pool-id uint) (tick int) (dx uint) (dy uint) (who principal))
  (quote-add pool-id tick dx dy (some who)))

(define-private (quote-x-for-y (pool-id uint) (tick int) (dx uint) (max-price uint) (who (optional principal)))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (bal (get bin lb))
      (discount (match who caller (discount-of pool-id (get discounts pool) caller) u0)))
    (step-x-for-y (get fr lb) (get balance-x bal) (get balance-y bal) dx (discounted (get fee-rate-x pool) discount) max-price)))

(define-private (quote-y-for-x (pool-id uint) (tick int) (dy uint) (min-price uint) (who (optional principal)))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (bal (get bin lb))
      (discount (match who caller (discount-of pool-id (get discounts pool) caller) u0)))
    (step-y-for-x (get fr lb) (get balance-x bal) (get balance-y bal) dy (discounted (get fee-rate-y pool) discount) min-price)))

(define-private (quote-add (pool-id uint) (tick int) (dx uint) (dy uint) (who (optional principal)))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (bal (get bin lb))
      (discount (match who caller (discount-of pool-id (get discounts pool) caller) u0)))
    (try! (check-amounts dx dy))
    (deposit (get fr lb) (get balance-x bal) (get balance-y bal) (get total-supply bal) dx dy
      (discounted (get fee-rate-x pool) discount) (discounted (get fee-rate-y pool) discount) (get fee-rebate pool))))

(define-public (create-pool (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (bin-step uint) (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint))
  (new-pool token-x-trait token-y-trait bin-step fee-rate-x fee-rate-y fee-rebate none))

(define-public (create-private-pool (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (bin-step uint) (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint) (depositor principal))
  (new-pool token-x-trait token-y-trait bin-step fee-rate-x fee-rate-y fee-rebate (some depositor)))

(define-private (new-pool (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (bin-step uint) (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint) (depositor (optional principal)))
  (let (
      (pool-id (+ (var-get pool-id-nonce) u1))
      (pool-key { token-x: (contract-of token-x-trait), token-y: (contract-of token-y-trait), bin-step: bin-step })
      (pool (merge pool-key { fee-rate-x: fee-rate-x, fee-rate-y: fee-rate-y, fee-rebate: fee-rebate, sunset: false, paused: false,
        native-x: (is-native-stx-token (get token-x pool-key)), native-y: (is-native-stx-token (get token-y pool-key)), depositor: depositor, discounts: u0 })))
    (try! (is-dao-or-extension))
    (asserts! (not (is-eq (get token-x pool-key) (get token-y pool-key))) ERR-INVALID-PAIR)
    (asserts! (< pool-id TOKEN-ID-MOD) ERR-MAX-POOLS-ALLOWED)
    (try! (bin-table bin-step))
    (try! (check-pool-fees fee-rate-x fee-rate-y fee-rebate))
    (asserts! (or (is-some depositor) (is-none (map-get? pool-id-by-token (merge pool-key { token-x: (get token-y pool-key), token-y: (get token-x pool-key) })))) ERR-POOL-ALREADY-EXISTS)
    (asserts! (or (is-some depositor) (map-insert pool-id-by-token pool-key pool-id)) ERR-POOL-ALREADY-EXISTS)
    (map-set pools pool-id pool)
    (map-set listed-tokens (get token-x pool-key) true)
    (map-set listed-tokens (get token-y pool-key) true)
    (var-set pool-id-nonce pool-id)
    (print { type: (if (is-some depositor) "create-private-pool" "create-pool"), pool-id: pool-id, pool: pool, sender: tx-sender })
    (ok pool-id)))

(define-public (set-pool-depositor (pool-id uint) (depositor principal))
  (let ((pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND)))
    (try! (is-dao-or-extension))
    (asserts! (is-some (get depositor pool)) ERR-PUBLIC-POOL)
    (map-set pools pool-id (merge pool { depositor: (some depositor) }))
    (print { type: "set-pool-depositor", pool-id: pool-id, old-depositor: (get depositor pool), depositor: depositor, sender: tx-sender })
    (ok true)))

(define-public (set-fee-discount (pool-id uint) (who principal) (discount uint))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (key { pool-id: pool-id, who: who })
      (had (is-some (map-get? fee-discounts key))))
    (try! (is-dao-or-extension))
    (asserts! (is-none (get depositor pool)) ERR-PRIVATE-POOL)
    (asserts! (<= discount ONE_8) ERR-PERCENT-GREATER-THAN-ONE)
    (if (is-eq discount u0) (map-delete fee-discounts key) (map-set fee-discounts key discount))
    (map-set pools pool-id (merge pool { discounts: (- (+ (get discounts pool) (if (> discount u0) u1 u0)) (if had u1 u0)) }))
    (print { type: "set-fee-discount", pool-id: pool-id, who: who, discount: discount, sender: tx-sender })
    (ok true)))

(define-public (update-pool-fee (pool-id uint) (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint))
  (let ((pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND)))
    (try! (is-dao-or-extension))
    (try! (check-pool-fees fee-rate-x fee-rate-y fee-rebate))
    (map-set pools pool-id (merge pool { fee-rate-x: fee-rate-x, fee-rate-y: fee-rate-y, fee-rebate: fee-rebate }))
    (print { type: "update-pool-fee", pool-id: pool-id, fee-rate-x: fee-rate-x, fee-rate-y: fee-rate-y, fee-rebate: fee-rebate, sender: tx-sender })
    (ok true)))

(define-public (set-pool-status (pool-id uint) (sunset bool) (paused bool))
  (let ((pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND)))
    (try! (is-dao-or-extension))
    (map-set pools pool-id (merge pool { sunset: sunset, paused: paused }))
    (print { type: "set-pool-status", pool-id: pool-id, sunset: sunset, paused: paused, sender: tx-sender })
    (ok true)))

(define-public (set-native-stx-token (token principal) (native bool))
  (begin
    (try! (is-dao-or-extension))
    (asserts! (not (is-listed-token token)) ERR-TOKEN-LISTED)
    (map-set native-stx-tokens token native)
    (print { type: "set-native-stx-token", token: token, native: native, sender: tx-sender })
    (ok true)))

(define-public (claim-fees (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (recipient principal))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (fees (get-pool-fees pool-id)))
    (try! (is-dao-or-extension))
    (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait))
    (map-set pool-fees pool-id { fee-x: u0, fee-y: u0 })
    (and (> (get fee-x fees) u0) (try! (transfer-out token-x-trait (get token-x pool) (get native-x pool) (get fee-x fees) recipient)))
    (and (> (get fee-y fees) u0) (try! (transfer-out token-y-trait (get token-y pool) (get native-y pool) (get fee-y fees) recipient)))
    (print { type: "claim-fees", pool-id: pool-id, fee-x: (get fee-x fees), fee-y: (get fee-y fees), recipient: recipient, sender: tx-sender })
    (ok fees)))

(define-public (add-to-position (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (tick int) (dx uint) (dy uint) (min-price uint) (max-price uint) (min-shares uint))
  (let (
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (fr (get fr lb))
      (checked (try! (check-amounts dx dy)))
      (bal (get bin lb))
      (supply (get total-supply bal))
      (discount (discount-of pool-id (get discounts pool) tx-sender))
      (rate-x (discounted (get fee-rate-x pool) discount))
      (rate-y (discounted (get fee-rate-y pool) discount))
      (d (try! (deposit fr (get balance-x bal) (get balance-y bal) supply dx dy rate-x rate-y (get fee-rebate pool))))
      (u (try! (to-frame (get x d) (get sx fr))))
      (v (try! (to-frame (get y d) (get sy fr))))
      (s (if (> (get L d) u0) (try! (current-sqrt fr u (get L d))) (get a fr)))
      (price-bounds (try! (current-sqrt-bounds fr u v (get L d))))
      (token-id (get-liquidity-token-id pool-id tick))
      (fees (get-pool-fees pool-id)))
    (asserts! (not (get paused pool)) ERR-POOL-PAUSED)
    (asserts! (not (get sunset pool)) ERR-POOL-SUNSET)
    (asserts! (match (get depositor pool) only (is-eq tx-sender only) true) ERR-NOT-DEPOSITOR)
    (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait))
    (asserts! (> (+ dx dy) u0) ERR-INVALID-AMOUNT)
    (asserts! (> (get shares d) u0) ERR-INVALID-LP-STATE)
    (asserts! (>= (get shares d) min-shares) ERR-SLIPPAGE)
    (asserts! (and
      (>= (get lo price-bounds) (frame-price-limit fr min-price true))
      (<= (get hi price-bounds) (frame-price-limit fr max-price false))) ERR-INVALID-PRICE)
    (and (> dx u0) (try! (transfer-in token-x-trait (get token-x pool) (get native-x pool) dx tx-sender)))
    (and (> dy u0) (try! (transfer-in token-y-trait (get token-y pool) (get native-y pool) dy tx-sender)))
    (map-set bins { pool-id: pool-id, tick: tick } (merge bal { balance-x: (get x d), balance-y: (get y d), total-supply: (+ supply (get shares d) (get locked d)) }))
    (map-set pool-fees pool-id { fee-x: (+ (get fee-x fees) (- (get fee-x d) (get lp-fee-x d))), fee-y: (+ (get fee-y fees) (- (get fee-y d) (get lp-fee-y d))) })
    (and (> (get locked d) u0) (try! (contract-call? .clmm-lp-token-v1 mint token-id (get locked d) current-contract)))
    (try! (contract-call? .clmm-lp-token-v1 mint token-id (get shares d) tx-sender))
    (print { type: "add-to-position", pool-id: pool-id, tick: tick, dx: dx, dy: dy, shares: (get shares d), fee-x: (get fee-x d), fee-y: (get fee-y d), fee-rate-x: rate-x, fee-rate-y: rate-y, price: (try! (sqrt-to-wad fr s)), sender: tx-sender })
    (ok { dx: dx, dy: dy, shares: (get shares d), fee-x: (get fee-x d), fee-y: (get fee-y d) })))

(define-private (check-owner)
  (ok (asserts! (is-eq tx-sender contract-caller) ERR-NOT-AUTHORIZED)))

(define-public (reduce-position (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (tick int) (percent uint) (min-dx uint) (min-dy uint))
  (let (
      (checked (try! (check-owner)))
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (bal (unwrap! (map-get? bins { pool-id: pool-id, tick: tick }) ERR-POSITION-NOT-FOUND))
      (supply (get total-supply bal))
      (token-id (get-liquidity-token-id pool-id tick))
      (shares (try! (mul-div (contract-call? .clmm-lp-token-v1 get-balance-or-default token-id tx-sender) percent ONE_8)))
      (out-x (try! (mul-div (get balance-x bal) shares supply)))
      (out-y (try! (mul-div (get balance-y bal) shares supply))))
    (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait))
    (asserts! (<= percent ONE_8) ERR-PERCENT-GREATER-THAN-ONE)
    (asserts! (> shares u0) ERR-ZERO-PERCENT)
    (asserts! (and (>= out-x min-dx) (>= out-y min-dy)) ERR-SLIPPAGE)
    (try! (contract-call? .clmm-lp-token-v1 burn token-id shares tx-sender))
    (map-set bins { pool-id: pool-id, tick: tick } (merge bal { balance-x: (- (get balance-x bal) out-x), balance-y: (- (get balance-y bal) out-y), total-supply: (- supply shares) }))
    (and (> out-x u0) (try! (transfer-out token-x-trait (get token-x pool) (get native-x pool) out-x tx-sender)))
    (and (> out-y u0) (try! (transfer-out token-y-trait (get token-y pool) (get native-y pool) out-y tx-sender)))
    (print { type: "reduce-position", pool-id: pool-id, tick: tick, shares: shares, dx: out-x, dy: out-y, percent: percent, sender: tx-sender })
    (ok { shares: shares, dx: out-x, dy: out-y })))

(define-public (reduce-positions (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (items (list 64 { tick: int, percent: uint })) (min-dx uint) (min-dy uint))
  (let (
      (checked (try! (check-owner)))
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (tokens (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait)))
      (w (try! (fold reduce-positions-iter items (ok { pool-id: pool-id, shares: u0, dx: u0, dy: u0 })))))
    (asserts! (and (>= (get dx w) min-dx) (>= (get dy w) min-dy)) ERR-SLIPPAGE)
    (and (> (get dx w) u0) (try! (transfer-out token-x-trait (get token-x pool) (get native-x pool) (get dx w) tx-sender)))
    (and (> (get dy w) u0) (try! (transfer-out token-y-trait (get token-y pool) (get native-y pool) (get dy w) tx-sender)))
    (print { type: "reduce-positions", pool-id: pool-id, shares: (get shares w), dx: (get dx w), dy: (get dy w), sender: tx-sender })
    (ok { shares: (get shares w), dx: (get dx w), dy: (get dy w) })))

(define-private (reduce-positions-iter (item { tick: int, percent: uint }) (acc (response { pool-id: uint, shares: uint, dx: uint, dy: uint } uint)))
  (let (
      (s (try! acc))
      (pool-id (get pool-id s))
      (tick (get tick item))
      (percent (get percent item))
      (bal (unwrap! (map-get? bins { pool-id: pool-id, tick: tick }) ERR-POSITION-NOT-FOUND))
      (supply (get total-supply bal))
      (token-id (get-liquidity-token-id pool-id tick))
      (shares (begin
        (asserts! (<= percent ONE_8) ERR-PERCENT-GREATER-THAN-ONE)
        (try! (mul-div (contract-call? .clmm-lp-token-v1 get-balance-or-default token-id tx-sender) percent ONE_8)))))
    (if (is-eq shares u0)
      (ok s)
      (let (
          (out-x (try! (mul-div (get balance-x bal) shares supply)))
          (out-y (try! (mul-div (get balance-y bal) shares supply))))
        (try! (contract-call? .clmm-lp-token-v1 burn token-id shares tx-sender))
        (map-set bins { pool-id: pool-id, tick: tick } (merge bal { balance-x: (- (get balance-x bal) out-x), balance-y: (- (get balance-y bal) out-y), total-supply: (- supply shares) }))
        (print { type: "reduce-position", pool-id: pool-id, tick: tick, shares: shares, dx: out-x, dy: out-y, percent: percent, sender: tx-sender })
        (ok (merge s { shares: (if (> shares (- MAX-U128 (get shares s))) MAX-U128 (+ (get shares s) shares)), dx: (+ (get dx s) out-x), dy: (+ (get dy s) out-y) }))))))

(define-public (swap-x-for-y-ioc (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (tick int) (dx uint) (max-price uint) (min-dy uint) (deadline uint))
  (let (
      (checked (try! (check-amounts dx u0)))
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (bal (get bin lb))
      (fr (get fr lb))
      (rate (discounted (get fee-rate-x pool) (discount-of pool-id (get discounts pool) tx-sender)))
      (step (try! (step-x-for-y fr (get balance-x bal) (get balance-y bal) dx rate max-price)))
      (in (get in step))
      (out (get out step))
      (fee (get fee step))
      (lp-fee (try! (mul-div fee (get fee-rebate pool) ONE_8)))
      (fees (get-pool-fees pool-id)))
    (asserts! (not (get paused pool)) ERR-POOL-PAUSED)
    (asserts! (<= stacks-block-time deadline) ERR-EXPIRED)
    (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait))
    (asserts! (>= out min-dy) ERR-SLIPPAGE)
    (if (> out u0)
      (begin
        (try! (transfer-in token-x-trait (get token-x pool) (get native-x pool) in tx-sender))
        (try! (transfer-out token-y-trait (get token-y pool) (get native-y pool) out tx-sender))
        (map-set bins { pool-id: pool-id, tick: tick } (merge bal {
          balance-x: (+ (get balance-x bal) (- in fee) lp-fee),
          balance-y: (- (get balance-y bal) out) }))
        (map-set pool-fees pool-id (merge fees { fee-x: (+ (get fee-x fees) (- fee lp-fee)) }))
        (print { type: "swap-x-for-y", pool-id: pool-id, tick: tick, dx: in, dy: out, fee: fee, lp-fee: lp-fee, fee-rate: rate, max-price: max-price, sender: tx-sender })
        (ok { dx: in, dy: out, fee: fee }))
      (ok { dx: u0, dy: u0, fee: u0 }))))

(define-public (swap-y-for-x-ioc (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (tick int) (dy uint) (min-price uint) (min-dx uint) (deadline uint))
  (let (
      (checked (try! (check-amounts dy u0)))
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (lb (try! (load-bin pool-id (get bin-step pool) tick)))
      (bal (get bin lb))
      (fr (get fr lb))
      (rate (discounted (get fee-rate-y pool) (discount-of pool-id (get discounts pool) tx-sender)))
      (step (try! (step-y-for-x fr (get balance-x bal) (get balance-y bal) dy rate min-price)))
      (in (get in step))
      (out (get out step))
      (fee (get fee step))
      (lp-fee (try! (mul-div fee (get fee-rebate pool) ONE_8)))
      (fees (get-pool-fees pool-id)))
    (asserts! (not (get paused pool)) ERR-POOL-PAUSED)
    (asserts! (<= stacks-block-time deadline) ERR-EXPIRED)
    (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait))
    (asserts! (>= out min-dx) ERR-SLIPPAGE)
    (if (> out u0)
      (begin
        (try! (transfer-in token-y-trait (get token-y pool) (get native-y pool) in tx-sender))
        (try! (transfer-out token-x-trait (get token-x pool) (get native-x pool) out tx-sender))
        (map-set bins { pool-id: pool-id, tick: tick } (merge bal {
          balance-x: (- (get balance-x bal) out),
          balance-y: (+ (get balance-y bal) (- in fee) lp-fee) }))
        (map-set pool-fees pool-id (merge fees { fee-y: (+ (get fee-y fees) (- fee lp-fee)) }))
        (print { type: "swap-y-for-x", pool-id: pool-id, tick: tick, dx: out, dy: in, fee: fee, lp-fee: lp-fee, fee-rate: rate, min-price: min-price, sender: tx-sender })
        (ok { dx: out, dy: in, fee: fee }))
      (ok { dx: u0, dy: u0, fee: u0 }))))

(define-public (swap-x-for-y-route (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (ticks (list 32 int)) (dx uint) (max-price uint) (min-dy uint) (allow-partial-fill bool) (deadline uint))
  (let (
      (checked (try! (check-amounts dx u0)))
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (live (asserts! (not (get paused pool)) ERR-POOL-PAUSED))
      (on-time (asserts! (<= stacks-block-time deadline) ERR-EXPIRED))
      (tokens (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait)))
      (rate (discounted (get fee-rate-x pool) (discount-of pool-id (get discounts pool) tx-sender)))
      (walk (try! (fold route-x-iter ticks (ok { pool-id: pool-id, bin-step: (get bin-step pool), fee-rate: rate, fee-rebate: (get fee-rebate pool), price: max-price, last: none, left: dx, out: u0, fee: u0, lp: u0 }))))
      (left (get left walk))
      (spent (- dx left))
      (out (get out walk))
      (fee (get fee walk))
      (lp-fee (get lp walk))
      (fees (get-pool-fees pool-id)))
    (asserts! (or allow-partial-fill (is-eq left u0)) ERR-NOT-FILLED)
    (asserts! (>= out min-dy) ERR-SLIPPAGE)
    (if (> out u0)
      (begin
        (try! (transfer-in token-x-trait (get token-x pool) (get native-x pool) spent tx-sender))
        (try! (transfer-out token-y-trait (get token-y pool) (get native-y pool) out tx-sender))
        (map-set pool-fees pool-id (merge fees { fee-x: (+ (get fee-x fees) (- fee lp-fee)) }))
        (print { type: "swap-x-for-y-route", pool-id: pool-id, dx: spent, dy: out, fee: fee, lp-fee: lp-fee, fee-rate: rate, max-price: max-price, sender: tx-sender })
        (ok { dx: spent, dy: out, fee: fee }))
      (ok { dx: u0, dy: u0, fee: u0 }))))

(define-public (swap-y-for-x-route (token-x-trait <ft-trait>) (token-y-trait <ft-trait>) (pool-id uint) (ticks (list 32 int)) (dy uint) (min-price uint) (min-dx uint) (allow-partial-fill bool) (deadline uint))
  (let (
      (checked (try! (check-amounts dy u0)))
      (pool (unwrap! (map-get? pools pool-id) ERR-POOL-NOT-FOUND))
      (live (asserts! (not (get paused pool)) ERR-POOL-PAUSED))
      (on-time (asserts! (<= stacks-block-time deadline) ERR-EXPIRED))
      (tokens (try! (check-tokens (get token-x pool) (get token-y pool) token-x-trait token-y-trait)))
      (rate (discounted (get fee-rate-y pool) (discount-of pool-id (get discounts pool) tx-sender)))
      (walk (try! (fold route-y-iter ticks (ok { pool-id: pool-id, bin-step: (get bin-step pool), fee-rate: rate, fee-rebate: (get fee-rebate pool), price: min-price, last: none, left: dy, out: u0, fee: u0, lp: u0 }))))
      (left (get left walk))
      (spent (- dy left))
      (out (get out walk))
      (fee (get fee walk))
      (lp-fee (get lp walk))
      (fees (get-pool-fees pool-id)))
    (asserts! (or allow-partial-fill (is-eq left u0)) ERR-NOT-FILLED)
    (asserts! (>= out min-dx) ERR-SLIPPAGE)
    (if (> out u0)
      (begin
        (try! (transfer-in token-y-trait (get token-y pool) (get native-y pool) spent tx-sender))
        (try! (transfer-out token-x-trait (get token-x pool) (get native-x pool) out tx-sender))
        (map-set pool-fees pool-id (merge fees { fee-y: (+ (get fee-y fees) (- fee lp-fee)) }))
        (print { type: "swap-y-for-x-route", pool-id: pool-id, dx: out, dy: spent, fee: fee, lp-fee: lp-fee, fee-rate: rate, min-price: min-price, sender: tx-sender })
        (ok { dx: out, dy: spent, fee: fee }))
      (ok { dx: u0, dy: u0, fee: u0 }))))

(define-private (route-x-iter (tick int) (acc (response { pool-id: uint, bin-step: uint, fee-rate: uint, fee-rebate: uint, price: uint, last: (optional int), left: uint, out: uint, fee: uint, lp: uint } uint)))
  (let (
      (s (try! acc))
      (left (get left s)))
    (asserts! (match (get last s) prev (> tick prev) true) ERR-INVALID-ROUTE)
    (if (is-eq left u0)
      (ok (merge s { last: (some tick) }))
      (let (
          (pool-id (get pool-id s))
          (lb (try! (load-bin pool-id (get bin-step s) tick)))
          (bal (get bin lb))
          (bx (get balance-x bal))
          (by (get balance-y bal))
          (step (try! (step-x-for-y (get fr lb) bx by left (get fee-rate s) (get price s))))
          (fee (get fee step))
          (out (get out step))
          (lp-fee (try! (mul-div fee (get fee-rebate s) ONE_8))))
        (if (is-eq out u0)
          (ok (merge s { last: (some tick) }))
          (begin
            (map-set bins { pool-id: pool-id, tick: tick } (merge bal {
              balance-x: (+ bx (- (get in step) fee) lp-fee),
              balance-y: (- by out) }))
            (ok (merge s {
              left: (- left (get in step)),
              out: (+ (get out s) out),
              fee: (+ (get fee s) fee),
              lp: (+ (get lp s) lp-fee),
              last: (some tick) }))))))))

(define-private (route-y-iter (tick int) (acc (response { pool-id: uint, bin-step: uint, fee-rate: uint, fee-rebate: uint, price: uint, last: (optional int), left: uint, out: uint, fee: uint, lp: uint } uint)))
  (let (
      (s (try! acc))
      (left (get left s)))
    (asserts! (match (get last s) prev (< tick prev) true) ERR-INVALID-ROUTE)
    (if (is-eq left u0)
      (ok (merge s { last: (some tick) }))
      (let (
          (pool-id (get pool-id s))
          (lb (try! (load-bin pool-id (get bin-step s) tick)))
          (bal (get bin lb))
          (bx (get balance-x bal))
          (by (get balance-y bal))
          (step (try! (step-y-for-x (get fr lb) bx by left (get fee-rate s) (get price s))))
          (fee (get fee step))
          (out (get out step))
          (lp-fee (try! (mul-div fee (get fee-rebate s) ONE_8))))
        (if (is-eq out u0)
          (ok (merge s { last: (some tick) }))
          (begin
            (map-set bins { pool-id: pool-id, tick: tick } (merge bal {
              balance-x: (- bx out),
              balance-y: (+ by (- (get in step) fee) lp-fee) }))
            (ok (merge s {
              left: (- left (get in step)),
              out: (+ (get out s) out),
              fee: (+ (get fee s) fee),
              lp: (+ (get lp s) lp-fee),
              last: (some tick) }))))))))

(define-private (check-tokens (token-x principal) (token-y principal) (token-x-trait <ft-trait>) (token-y-trait <ft-trait>))
  (begin
    (asserts! (is-eq (contract-of token-x-trait) token-x) ERR-INVALID-TOKEN-TRAIT)
    (ok (asserts! (is-eq (contract-of token-y-trait) token-y) ERR-INVALID-TOKEN-TRAIT))))

(define-private (transfer-in (token <ft-trait>) (asset principal) (is-stx bool) (amount uint) (owner principal))
  (if is-stx
    (restrict-assets? owner ((with-stx amount)) (try! (pull token amount owner)))
    (restrict-assets? owner ((with-ft asset "*" amount)) (try! (pull token amount owner)))))

(define-private (pull (token <ft-trait>) (amount uint) (owner principal))
  (let ((before (try! (contract-call? token get-balance current-contract))))
    (try! (contract-call? token transfer amount owner current-contract none))
    (ok (asserts! (is-eq (try! (contract-call? token get-balance current-contract)) (+ before amount)) ERR-TRANSFER-MISMATCH))))

(define-private (transfer-out (token <ft-trait>) (asset principal) (is-stx bool) (amount uint) (recipient principal))
  (if is-stx
    (as-contract? ((with-stx amount)) (try! (pay token amount recipient)))
    (as-contract? ((with-ft asset "*" amount)) (try! (pay token amount recipient)))))

(define-private (pay (token <ft-trait>) (amount uint) (recipient principal))
  (let (
      (pool-before (try! (contract-call? token get-balance current-contract)))
      (recipient-before (try! (contract-call? token get-balance recipient))))
    (try! (contract-call? token transfer amount current-contract recipient none))
    (ok (asserts!
      (and
        (is-eq (try! (contract-call? token get-balance current-contract)) (- pool-before amount))
        (is-eq (try! (contract-call? token get-balance recipient)) (+ recipient-before amount)))
      ERR-TRANSFER-MISMATCH))))

(define-private (step-x-for-y (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (x uint) (y uint) (gross uint) (fee-rate uint) (max-price uint))
  (if (or (is-eq y u0) (is-eq gross u0))
    (ok NOOP)
    (let (
        (sx (get sx fr))
        (sy (get sy fr))
        (b (get b fr))
        (u (try! (to-frame x sx)))
        (v (try! (to-frame y sy)))
        (L (try! (liquidity fr u v)))
        (limit (frame-price-limit fr max-price false))
        (target (min limit b)))
      (let (
          (xy (try! (virtual-reserves fr u v L true)))
          (xx (get x xy))
          (yy (get y xy))
          (du-need (sub-floor (mul-shr-dn L target) xx))
          (need (if (< limit b) (bit-shift-right du-need sx) (ceil-shift du-need sx)))
          (room (- (- (bit-shift-right MAX-FRAME sx) u1) x))
          (split (try! (accept (min gross room) need fee-rate)))
          (net (get net split))
          (fee (get fee split))
          (du (bit-shift-left net sx))
          (out (min (bit-shift-right (haircut (try! (mul-div yy du (+ xx du)))) sy) y)))
        (ok (if (or (is-eq net u0) (is-eq out u0))
          NOOP
          { in: (+ net fee), out: out, fee: fee }))))))

(define-private (step-y-for-x (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (x uint) (y uint) (gross uint) (fee-rate uint) (min-price uint))
  (if (or (is-eq x u0) (is-eq gross u0))
    (ok NOOP)
    (let (
        (sx (get sx fr))
        (sy (get sy fr))
        (a (get a fr))
        (u (try! (to-frame x sx)))
        (v (try! (to-frame y sy)))
        (L (try! (liquidity fr u v)))
        (limit (frame-price-limit fr min-price true))
        (target (max limit a)))
      (let (
          (xy (try! (virtual-reserves fr u v L false)))
          (xx (get x xy))
          (yy (get y xy))
          (dv-need (sub-floor (try! (mul-div L ONE target)) yy))
          (need (if (> limit a) (bit-shift-right dv-need sy) (ceil-shift dv-need sy)))
          (room (- (- (bit-shift-right MAX-FRAME sy) u1) y))
          (split (try! (accept (min gross room) need fee-rate)))
          (net (get net split))
          (fee (get fee split))
          (dv (bit-shift-left net sy))
          (out (min (bit-shift-right (haircut (try! (mul-div xx dv (+ yy dv)))) sx) x)))
        (ok (if (or (is-eq net u0) (is-eq out u0))
          NOOP
          { in: (+ net fee), out: out, fee: fee }))))))

(define-private (accept (gross uint) (need uint) (fee-rate uint))
  (let (
      (in (match (mul-div-up need ONE_8 (- ONE_8 fee-rate)) c (min gross c) overflow gross))
      (fee (try! (mul-div-up in fee-rate ONE_8))))
    (ok { net: (- in fee), fee: fee })))

(define-private (virtual-reserves (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (u uint) (v uint) (L uint) (x-in bool))
  (let (
      (lo L)
      (hi (+ L (l-error L))))
    (if x-in
      (ok { x: (+ u (mul-shr-up hi (get a fr))), y: (+ v (try! (mul-div lo ONE (get b fr)))) })
      (ok { x: (+ u (mul-shr-dn lo (get a fr))), y: (+ v (try! (mul-div-up hi ONE (get b fr)))) }))))

(define-private (bin-table (bin-step uint))
  (if (is-eq bin-step u100) (ok TABLE-100)
  (if (is-eq bin-step u500) (ok TABLE-500)
  (if (is-eq bin-step u1000) (ok TABLE-1000)
  (if (is-eq bin-step u2000) (ok TABLE-2000)
  ERR-INVALID-BIN-STEP)))))

(define-private (sqrt-price-iter (p { m: uint, e: uint }) (acc { t: uint, mu: uint, eps: uint }))
  (let ((t (get t acc)))
    (if (is-eq (bit-and t u1) u1)
      (let (
          (mu (/ (* (get mu acc) (get m p)) ONE))
          (eps (+ (get eps acc) (get e p))))
        (if (>= mu TWO-ONE)
          { t: (bit-shift-right t u1), mu: (bit-shift-right mu u1), eps: (+ eps u1) }
          { t: (bit-shift-right t u1), mu: mu, eps: eps }))
      (merge acc { t: (bit-shift-right t u1) }))))

(define-private (sqrt-price (table { r: uint, max-tick: uint, pows: (list 13 { m: uint, e: uint }) }) (tick int))
  (let (
      (max-tick (to-int (get max-tick table)))
      (t (begin
        (asserts! (and (<= tick max-tick) (>= tick (- 0 max-tick))) ERR-TICK-OUT-OF-RANGE)
        (to-uint (if (< tick 0) (- 0 tick) tick))))
      (pos (fold sqrt-price-iter (get pows table) { t: t, mu: ONE, eps: u0 }))
      (eps (to-int (get eps pos))))
    (if (< tick 0)
      (let ((inv (/ Q120 (get mu pos))))
        (ok (if (< inv ONE) { mu: (bit-shift-left inv u1), eps: (- -1 eps) } { mu: inv, eps: (- 0 eps) })))
      (ok { mu: (get mu pos), eps: eps }))))

(define-private (frame (bin-step uint) (tick int))
  (let (
      (table (try! (bin-table bin-step)))
      (sp (try! (sqrt-price table tick)))
      (e (* 2 (get eps sp)))
      (a (get mu sp))
      (b (/ (* a (get r table)) ONE))
      (c70 (/ (bit-shift-left (- b a) u70) b)))
    (ok {
      a: a,
      b: b,
      cu: (+ c70 u1),
      cd4: (bit-shift-left (bit-shift-right c70 u10) u2),
      sx: (if (< e 0) (to-uint (- 0 e)) u0),
      sy: (if (> e 0) (to-uint e) u0),
      e: e })))

(define-private (check-amounts (a uint) (b uint))
  (ok (asserts! (and (< a MAX-FRAME) (< b MAX-FRAME)) ERR-AMOUNT-TOO-LARGE)))

(define-private (to-frame (amount uint) (shift uint))
  (if (< amount (bit-shift-right MAX-FRAME shift))
    (ok (bit-shift-left amount shift))
    ERR-AMOUNT-TOO-LARGE))

(define-private (liquidity (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (u uint) (v uint))
  (let ((m (max u v)))
    (asserts! (< m MAX-FRAME) ERR-AMOUNT-TOO-LARGE)
    (if (is-eq m u0)
      (ok u0)
      (let ((e (log2 m)))
        (if (>= e u61)
          (let ((k (- e u61)))
            (ok (bit-shift-left (solve fr (bit-shift-right u k) (bit-shift-right v k)) (+ k u6))))
          (let (
              (d (- u61 e))
              (l6 (solve fr (bit-shift-left u d) (bit-shift-left v d))))
            (ok (if (> d u6) (bit-shift-right l6 (- d u6)) (bit-shift-left l6 (- u6 d))))))))))

(define-private (solve (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (uu uint) (vv uint))
  (let (
      (B (+ (/ (bit-shift-left uu u60) (get b fr)) (bit-shift-right (* (get a fr) vv) u60)))
      (disc (+ (* B B) (* (get cd4 fr) (bit-shift-right (* uu vv) u60)))))
    (/ (bit-shift-left (+ B (sqrti disc)) u63) (get cu fr))))

(define-private (current-sqrt (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (u uint) (L uint))
  (ok (min (+ (get a fr) (try! (mul-div u ONE L))) (get b fr))))

(define-private (current-sqrt-bounds (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (u uint) (v uint) (L uint))
  (let ((a (get a fr)) (b (get b fr)))
    (if (is-eq u u0)
      (ok { lo: a, hi: a })
      (if (is-eq v u0)
        (ok { lo: b, hi: b })
        (if (is-eq L u0)
          (ok { lo: a, hi: b })
          (ok {
            lo: (+ a (try! (mul-div u ONE (+ L (l-error L))))),
            hi: (min b (+ a (try! (mul-div-up u ONE L)))) }))))))

(define-private (frame-price-limit (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (price uint) (up bool))
  (let (
      (e (get e fr))
      (num (if (<= e 60) (bit-shift-left u1 (to-uint (- 60 e))) u1))
      (den (if (<= e 60) WAD (bit-shift-left WAD (to-uint (- e 60))))))
    (if (is-eq price u0)
      u0
      (if (>= price PRICE-SATURATION)
        (* u2 (get b fr))
        (match (if up (mul-div-up price num den) (mul-div price num den))
          q (if (>= q FRAME-PRICE-SATURATION)
            (* u2 (get b fr))
            (let ((p (bit-shift-left q u60)) (r (sqrti p)))
              (if (and up (< (* r r) p)) (+ r u1) r)))
          overflow (* u2 (get b fr)))))))

(define-private (bin-price-wad (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (x uint) (y uint))
  (let (
      (u (try! (to-frame x (get sx fr))))
      (v (try! (to-frame y (get sy fr))))
      (L (try! (liquidity fr u v))))
    (sqrt-to-wad fr (if (> L u0) (try! (current-sqrt fr u L)) (get a fr)))))

(define-private (sqrt-to-wad (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (s uint))
  (let (
      (pw (try! (mul-div (/ (* s s) ONE) WAD ONE)))
      (e (get e fr)))
    (ok (if (>= e 0) (bit-shift-left pw (to-uint e)) (bit-shift-right pw (to-uint (- 0 e)))))))

(define-private (deposit (fr { a: uint, b: uint, cu: uint, cd4: uint, sx: uint, sy: uint, e: int }) (x uint) (y uint) (supply uint) (dx uint) (dy uint) (fee-rate-x uint) (fee-rate-y uint) (fee-rebate uint))
  (let (
      (sx (get sx fr))
      (sy (get sy fr))
      (L1g (try! (liquidity fr (try! (to-frame (+ x dx) sx)) (try! (to-frame (+ y dy) sy))))))
    (if (is-eq supply u0)
      (ok { shares: (sub-floor L1g MIN-LIQUIDITY), locked: MIN-LIQUIDITY, fee-x: u0, fee-y: u0, lp-fee-x: u0, lp-fee-y: u0, x: (+ x dx), y: (+ y dy), L: L1g })
      (let (
          (L0 (try! (liquidity fr (try! (to-frame x sx)) (try! (to-frame y sy)))))
          (l0-up (+ L0 (l-error L0)))
          (l1g-down L1g)
          (fee-x (try! (implicit-swap-fee x dx y dy l0-up l1g-down fee-rate-x)))
          (fee-y (try! (implicit-swap-fee y dy x dx l0-up l1g-down fee-rate-y)))
          (lp-fee-x (try! (mul-div fee-x fee-rebate ONE_8)))
          (lp-fee-y (try! (mul-div fee-y fee-rebate ONE_8)))
          (bx (+ x lp-fee-x))
          (by (+ y lp-fee-y))
          (nx (- (+ bx dx) fee-x))
          (ny (- (+ by dy) fee-y))
          (L0c (if (is-eq (+ lp-fee-x lp-fee-y) u0) L0 (try! (liquidity fr (try! (to-frame bx sx)) (try! (to-frame by sy))))))
          (L1 (if (is-eq (+ fee-x fee-y) u0) L1g (try! (liquidity fr (try! (to-frame nx sx)) (try! (to-frame ny sy))))))
          (l0c-up (+ L0c (l-error L0c)))
          (l1-down L1))
        (ok {
          shares: (if (> l1-down l0c-up) (try! (mul-div supply (- l1-down l0c-up) l0c-up)) u0), locked: u0,
          fee-x: fee-x, fee-y: fee-y, lp-fee-x: lp-fee-x, lp-fee-y: lp-fee-y, x: nx, y: ny, L: L1 })))))

(define-private (implicit-swap-fee (z uint) (dz uint) (w uint) (dw uint) (l0-up uint) (l1-down uint) (fee-rate uint))
  (if (or (is-eq dz u0) (is-eq fee-rate u0))
    (ok u0)
    (let (
        (excess (if (> w u0) (match (mul-div dw z w) in-ratio (sub-floor dz in-ratio) overflow u0) dz))
        (n (if (> l1-down l0-up) (min excess (sub-floor (try! (mul-div-up (+ z dz) l0-up l1-down)) z)) excess))
        (g (match (mul-div-up n ONE_8 (- ONE_8 fee-rate)) gross (min gross dz) overflow dz)))
      (mul-div-up g fee-rate ONE_8))))

(define-private (load-bin (pool-id uint) (bin-step uint) (tick int))
  (match (map-get? bins { pool-id: pool-id, tick: tick })
    bin (let ((e (get e bin)))
      (ok { bin: bin, fr: { a: (get a bin), b: (get b bin), cu: (get cu bin), cd4: (get cd4 bin), e: e,
        sx: (if (< e 0) (to-uint (- 0 e)) u0), sy: (if (> e 0) (to-uint e) u0) } }))
    (let ((fr (try! (frame bin-step tick))))
      (ok { bin: { balance-x: u0, balance-y: u0, total-supply: u0, a: (get a fr), b: (get b fr), cu: (get cu fr), cd4: (get cd4 fr), e: (get e fr) }, fr: fr }))))

(define-private (min (a uint) (b uint)) (if (< a b) a b))
(define-private (max (a uint) (b uint)) (if (< a b) b a))
(define-private (sub-floor (a uint) (b uint)) (if (> a b) (- a b) u0))

(define-private (mul-shr-dn (x uint) (m uint))
  (+ (* (bit-shift-right x u60) m) (bit-shift-right (* (bit-and x MASK60) m) u60)))
(define-private (mul-shr-up (x uint) (m uint))
  (+ (* (bit-shift-right x u60) m) (ceil-shift (* (bit-and x MASK60) m) u60)))

(define-private (ceil-shift (z uint) (k uint))
  (+ (bit-shift-right z k) (if (> (bit-and z (- (bit-shift-left u1 k) u1)) u0) u1 u0)))

(define-private (l-error (L uint)) (+ (bit-shift-right L u55) u2))

(define-private (haircut (z uint))
  (sub-floor z (+ (bit-shift-right z MARGIN-SHIFT) u1)))

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
