;; SPDX-License-Identifier: LicenseRef-Zest-Proprietary
;;
;; clmm-lp-token-v1 - SIP-013 semi-fungible liquidity shares of
;; clmm-pool-v1. Token id = pool-id * 2^64 + (tick + 2^32); one id per bin.
;;
;; Shares are minted and burned only by clmm-pool-v1, in add-to-position and
;; reduce-position, so a bin's share supply always matches its balances and no
;; one - governance included - can create, destroy or redeem shares any other
;; way.
;;
;; Shares move only when their owner calls this contract itself (sender =
;; contract-caller), and the pool redeems them only for an owner that calls it
;; directly, so a contract the owner calls cannot move or redeem them. There is
;; no native token, so wallets attach no post-conditions to shares and need
;; none. (A native fungible mirror would cap the sum of all shares of all bins
;; at 2^128 - 1, and its amount could not name the id.) Overall balances and
;; supply are kept exactly as hi * 2^128 + lo and reported up to 2^128 - 1.
;; Per-owner token enumeration is left to indexers (sft_* print events):
;; keeping it on chain would let anyone grief an account by sending it dust of many
;; ids.

(impl-trait 'SPDBEG5X8XD50SPM1JJH0E5CTXGDV5NJTKAKKR5V.sip013-semi-fungible-token-trait.sip013-semi-fungible-token-trait)

(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-INSUFFICIENT-BALANCE (err u1))
(define-constant ERR-SAME-PRINCIPAL (err u2))
(define-constant ERR-ZERO-AMOUNT (err u3))
(define-constant ERR-INVALID-SENDER (err u4))
(define-constant MAX-U128 u340282366920938463463374607431768211455) ;; 2^128 - 1
(define-constant ZERO { hi: u0, lo: u0 })
(define-constant TOKEN-NAME "Zest CLMM LP")
(define-constant TOKEN-SYMBOL "ZCLMM-LP")

(define-map token-balances { token-id: uint, owner: principal } uint)
(define-map token-supplies uint uint)
;; sums over all ids, as hi * 2^128 + lo
(define-map overall-balances principal { hi: uint, lo: uint })
(define-data-var overall-supply { hi: uint, lo: uint } ZERO)

;; a 212-character base, the longest id (39 digits) and ".json" fit the
;; 256 characters of a SIP-016 URI
(define-data-var token-base-uri (optional (string-ascii 212)) none)
(define-data-var transferrable bool true)

(define-read-only (is-dao-or-extension)
  (ok (asserts! (or (is-eq tx-sender .executor-dao) (contract-call? .executor-dao is-extension contract-caller)) ERR-NOT-AUTHORIZED)))

;; hi * 2^128 + lo, plus or minus a. wide-sub never goes below zero: an
;; overall balance is the sum of the owner's per-id balances, so it covers
;; any amount leaving one of them (and the overall supply any burn).
(define-private (wide-add (w { hi: uint, lo: uint }) (a uint))
  (if (<= a (- MAX-U128 (get lo w)))
    { hi: (get hi w), lo: (+ (get lo w) a) }
    { hi: (+ (get hi w) u1), lo: (- a (- MAX-U128 (get lo w)) u1) }))
(define-private (wide-sub (w { hi: uint, lo: uint }) (a uint))
  (if (>= (get lo w) a)
    { hi: (get hi w), lo: (- (get lo w) a) }
    { hi: (- (get hi w) u1), lo: (+ (- MAX-U128 a) (get lo w) u1) }))
(define-private (capped (w { hi: uint, lo: uint }))
  (if (is-eq (get hi w) u0) (get lo w) MAX-U128))
(define-private (overall-of (who principal))
  (default-to ZERO (map-get? overall-balances who)))

;; ---------------------------------------------------------------- SIP-013 --

(define-read-only (get-balance (token-id uint) (who principal))
  (ok (get-balance-or-default token-id who)))
(define-read-only (get-overall-balance (who principal))
  (ok (capped (overall-of who))))
(define-read-only (get-total-supply (token-id uint))
  (ok (default-to u0 (map-get? token-supplies token-id))))
(define-read-only (get-overall-supply)
  (ok (capped (var-get overall-supply))))
;; shares are dimensionless liquidity units
(define-read-only (get-decimals (token-id uint))
  (ok u0))
;; none for an id that was never minted (SIP-016)
(define-read-only (get-token-uri (token-id uint))
  (ok (match (var-get token-base-uri) base-uri
    (if (is-some (map-get? token-supplies token-id)) (as-max-len? (concat (concat base-uri (int-to-ascii token-id)) ".json") u256) none)
    none)))
(define-read-only (get-name (token-id uint))
  (ok TOKEN-NAME))
(define-read-only (get-symbol (token-id uint))
  (ok TOKEN-SYMBOL))
(define-read-only (get-transferrable)
  (ok (var-get transferrable)))
(define-read-only (get-balance-or-default (token-id uint) (who principal))
  (default-to u0 (map-get? token-balances { token-id: token-id, owner: who })))

(define-public (transfer (token-id uint) (amount uint) (sender principal) (recipient principal))
  (move token-id amount sender recipient))

;; SIP-013: the raw memo is printed after the transfer event
(define-public (transfer-memo (token-id uint) (amount uint) (sender principal) (recipient principal) (memo (buff 34)))
  (begin
    (try! (move token-id amount sender recipient))
    (print memo)
    (ok true)))

(define-private (move (token-id uint) (amount uint) (sender principal) (recipient principal))
  (let ((sender-balance (get-balance-or-default token-id sender)))
    (asserts! (var-get transferrable) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq sender contract-caller) ERR-INVALID-SENDER)
    (asserts! (<= amount sender-balance) ERR-INSUFFICIENT-BALANCE)
    (asserts! (not (is-eq sender recipient)) ERR-SAME-PRINCIPAL)
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (map-set token-balances { token-id: token-id, owner: sender } (- sender-balance amount))
    (map-set token-balances { token-id: token-id, owner: recipient } (+ (get-balance-or-default token-id recipient) amount))
    (map-set overall-balances sender (wide-sub (overall-of sender) amount))
    (map-set overall-balances recipient (wide-add (overall-of recipient) amount))
    (print { type: "sft_transfer", token-id: token-id, amount: amount, sender: sender, recipient: recipient })
    (ok true)))

(define-private (transfer-many-iter (item { token-id: uint, amount: uint, sender: principal, recipient: principal }) (previous (response bool uint)))
  (match previous ok-value (move (get token-id item) (get amount item) (get sender item) (get recipient item)) err-value previous))

(define-public (transfer-many (transfers (list 200 { token-id: uint, amount: uint, sender: principal, recipient: principal })))
  (fold transfer-many-iter transfers (ok true)))

(define-private (transfer-many-memo-iter (item { token-id: uint, amount: uint, sender: principal, recipient: principal, memo: (buff 34) }) (previous (response bool uint)))
  (match previous ok-value (transfer-memo (get token-id item) (get amount item) (get sender item) (get recipient item) (get memo item)) err-value previous))

(define-public (transfer-many-memo (transfers (list 200 { token-id: uint, amount: uint, sender: principal, recipient: principal, memo: (buff 34) })))
  (fold transfer-many-memo-iter transfers (ok true)))

;; ------------------------------------------------------------- governance --

(define-public (set-transferrable (new-transferrable bool))
  (begin
    (try! (is-dao-or-extension))
    (ok (var-set transferrable new-transferrable))))

;; A new base URI changes every id's metadata. A SIP-019 notice for SFTs must
;; list the ids, which this contract does not enumerate, so governance follows
;; the change with notify-token-metadata-update for the ids indexers hold.
(define-public (set-token-base-uri (new-base-uri (optional (string-ascii 212))))
  (begin
    (try! (is-dao-or-extension))
    (ok (var-set token-base-uri new-base-uri))))

;; SIP-019 notice to metadata indexers
(define-public (notify-token-metadata-update (token-ids (list 200 uint)))
  (begin
    (try! (is-dao-or-extension))
    (print { notification: "token-metadata-update", payload: { token-class: "sft", token-ids: token-ids, contract-id: current-contract } })
    (ok true)))

;; ------------------------------------------------------------ pool calls --

(define-public (mint (token-id uint) (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq contract-caller .clmm-pool-v1) ERR-NOT-AUTHORIZED)
    (map-set token-balances { token-id: token-id, owner: recipient } (+ (get-balance-or-default token-id recipient) amount))
    (map-set token-supplies token-id (+ (default-to u0 (map-get? token-supplies token-id)) amount))
    (map-set overall-balances recipient (wide-add (overall-of recipient) amount))
    (var-set overall-supply (wide-add (var-get overall-supply) amount))
    (print { type: "sft_mint", token-id: token-id, amount: amount, recipient: recipient })
    (ok true)))

;; Shares leave only through reduce-position, which pays out the matching
;; reserves. Any other burn would destroy value and desynchronise the bin's
;; share supply.
(define-public (burn (token-id uint) (amount uint) (sender principal))
  (let ((sender-balance (get-balance-or-default token-id sender)))
    (asserts! (is-eq contract-caller .clmm-pool-v1) ERR-NOT-AUTHORIZED)
    (asserts! (<= amount sender-balance) ERR-INSUFFICIENT-BALANCE)
    (map-set token-balances { token-id: token-id, owner: sender } (- sender-balance amount))
    (map-set token-supplies token-id (- (default-to u0 (map-get? token-supplies token-id)) amount))
    (map-set overall-balances sender (wide-sub (overall-of sender) amount))
    (var-set overall-supply (wide-sub (var-get overall-supply) amount))
    (print { type: "sft_burn", token-id: token-id, amount: amount, sender: sender })
    (ok true)))
