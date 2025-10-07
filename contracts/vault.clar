(define-constant ERR-NOT-ADMIN u1000)
(define-constant ERR-INSUFFICIENT-BALANCE u1001)
(define-constant ERR-INVALID-AMOUNT u1002)
(define-constant ERR-PAUSED u1003)
(define-constant ERR-NOT-PAUSED u1004)
(define-constant ERR-INVALID-REDEEM u1005)
(define-constant ERR-INVALID-ADMIN u1006)
(define-constant ERR-MAX-DEPOSIT-EXCEEDED u1007)
(define-constant ERR-MIN-DEPOSIT-NOT-MET u1008)
(define-constant ERR-INVALID-FEE u1009)
(define-constant ERR-INVALID-ORACLE u1011)
(define-constant ERR-NOT-AUTHORIZED u1016)

(define-trait stablecoin-trait
  (
    (transfer (uint principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
    (approve (uint principal) (response bool uint))
  )
)

(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-deposits uint u0)
(define-data-var max-deposit uint u1000000000000)
(define-data-var min-deposit uint u100)
(define-data-var deposit-fee uint u0)
(define-data-var redeem-fee uint u0)
(define-data-var last-update uint u0)
(define-data-var oracle-contract (optional principal) none)
(define-data-var yield-accumulator uint u0)
(define-data-var decimals uint u6)
(define-data-var currency (string-ascii 10) "USD")
(define-data-var status bool true)

(define-map user-deposits principal uint)
(define-map user-shares principal uint)
(define-map vault-updates uint { timestamp: uint, updater: principal, change-type: (string-ascii 50) })

(define-read-only (get-vault-info)
  {
    admin: (var-get admin),
    paused: (var-get paused),
    total-deposits: (var-get total-deposits),
    max-deposit: (var-get max-deposit),
    min-deposit: (var-get min-deposit),
    deposit-fee: (var-get deposit-fee),
    redeem-fee: (var-get redeem-fee),
    last-update: (var-get last-update),
    yield-accumulator: (var-get yield-accumulator),
    decimals: (var-get decimals),
    currency: (var-get currency),
    status: (var-get status)
  }
)

(define-read-only (get-user-deposit (user principal))
  (map-get? user-deposits user)
)

(define-read-only (get-user-shares (user principal))
  (map-get? user-shares user)
)

(define-read-only (get-vault-update (id uint))
  (map-get? vault-updates id)
)

(define-read-only (is-admin (who principal))
  (is-eq who (var-get admin))
)

(define-private (validate-amount (amount uint))
  (if (and (> amount u0) (<= amount (var-get max-deposit)))
    (ok true)
    (err ERR-INVALID-AMOUNT))
)

(define-private (validate-min-deposit (amount uint))
  (if (>= amount (var-get min-deposit))
    (ok true)
    (err ERR-MIN-DEPOSIT-NOT-MET))
)

(define-private (validate-fee (fee uint))
  (if (<= fee u500)
    (ok true)
    (err ERR-INVALID-FEE))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
    (ok true)
    (err ERR-INVALID-ADMIN))
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (try! (validate-principal new-admin))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-paused (new-paused bool))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (var-set paused new-paused)
    (ok true)
  )
)

(define-public (set-max-deposit (new-max uint))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (asserts! (> new-max u0) (err ERR-INVALID-AMOUNT))
    (var-set max-deposit new-max)
    (ok true)
  )
)

(define-public (set-min-deposit (new-min uint))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (asserts! (> new-min u0) (err ERR-INVALID-AMOUNT))
    (var-set min-deposit new-min)
    (ok true)
  )
)

(define-public (set-deposit-fee (new-fee uint))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (try! (validate-fee new-fee))
    (var-set deposit-fee new-fee)
    (ok true)
  )
)

(define-public (set-redeem-fee (new-fee uint))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (try! (validate-fee new-fee))
    (var-set redeem-fee new-fee)
    (ok true)
  )
)

(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (try! (validate-principal new-oracle))
    (var-set oracle-contract (some new-oracle))
    (ok true)
  )
)

(define-public (update-yield (new-yield uint))
  (let (
    (oracle (unwrap! (var-get oracle-contract) (err ERR-INVALID-ORACLE)))
  )
    (asserts! (is-eq tx-sender oracle) (err ERR-NOT-AUTHORIZED))
    (var-set yield-accumulator (+ (var-get yield-accumulator) new-yield))
    (var-set last-update block-height)
    (ok true)
  )
)

(define-public (deposit (amount uint) (stable <stablecoin-trait>))
  (let (
    (user tx-sender)
    (fee-amount (/ (* amount (var-get deposit-fee)) u10000))
    (net-amount (- amount fee-amount))
    (current-deposit (default-to u0 (get-user-deposit user)))
    (total-shares (if (> (var-get total-deposits) u0) (var-get total-deposits) u1))
    (shares (/ (* net-amount total-shares) (var-get total-deposits)))
  )
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (try! (validate-amount amount))
    (try! (validate-min-deposit amount))
    (asserts! (>= (unwrap-panic (contract-call? stable get-balance user)) amount) (err ERR-INSUFFICIENT-BALANCE))
    (try! (contract-call? stable transfer amount user (as-contract tx-sender) none))
    (if (> fee-amount u0)
      (try! (as-contract (contract-call? stable transfer fee-amount (as-contract tx-sender) (var-get admin) none)))
      true
    )
    (map-set user-deposits user (+ current-deposit net-amount))
    (map-set user-shares user (+ (default-to u0 (get-user-shares user)) shares))
    (var-set total-deposits (+ (var-get total-deposits) net-amount))
    (map-set vault-updates (var-get last-update) { timestamp: block-height, updater: user, change-type: "deposit" })
    (var-set last-update (+ (var-get last-update) u1))
    (print { event: "deposit", user: user, amount: amount, net: net-amount, shares: shares })
    (ok net-amount)
  )
)

(define-public (redeem (shares uint) (stable <stablecoin-trait>))
  (let (
    (user tx-sender)
    (current-shares (default-to u0 (get-user-shares user)))
    (total-shares (if (> (var-get total-deposits) u0) (var-get total-deposits) u1))
    (amount (/ (* shares (var-get total-deposits)) total-shares))
    (fee-amount (/ (* amount (var-get redeem-fee)) u10000))
    (net-amount (- amount fee-amount))
    (accrued-yield (/ (* shares (var-get yield-accumulator)) total-shares))
    (total-out (+ net-amount accrued-yield))
  )
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (>= current-shares shares) (err ERR-INVALID-REDEEM))
    (map-set user-shares user (- current-shares shares))
    (map-set user-deposits user (- (default-to u0 (get-user-deposit user)) amount))
    (var-set total-deposits (- (var-get total-deposits) amount))
    (try! (as-contract (contract-call? stable transfer total-out (as-contract tx-sender) user none)))
    (if (> fee-amount u0)
      (try! (as-contract (contract-call? stable transfer fee-amount (as-contract tx-sender) (var-get admin) none)))
      true
    )
    (map-set vault-updates (var-get last-update) { timestamp: block-height, updater: user, change-type: "redeem" })
    (var-set last-update (+ (var-get last-update) u1))
    (print { event: "redeem", user: user, shares: shares, amount: total-out })
    (ok total-out)
  )
)

(define-public (emergency-withdraw (stable <stablecoin-trait>))
  (begin
    (asserts! (is-admin tx-sender) (err ERR-NOT-ADMIN))
    (asserts! (var-get paused) (err ERR-NOT-PAUSED))
    (let (
      (balance (unwrap-panic (as-contract (contract-call? stable get-balance (as-contract tx-sender)))))
    )
      (try! (as-contract (contract-call? stable transfer balance (as-contract tx-sender) (var-get admin) none)))
      (var-set total-deposits u0)
      (map-set vault-updates (var-get last-update) { timestamp: block-height, updater: tx-sender, change-type: "emergency-withdraw" })
      (var-set last-update (+ (var-get last-update) u1))
      (print { event: "emergency-withdraw", amount: balance })
      (ok balance)
    )
  )
)