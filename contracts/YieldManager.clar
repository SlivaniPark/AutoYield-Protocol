(define-constant ERR-NOT-AUTHORIZED u2000)
(define-constant ERR-INVALID-POOL u2001)
(define-constant ERR-INSUFFICIENT-FUNDS u2002)
(define-constant ERR-LOW-YIELD u2003)
(define-constant ERR-INVALID-APY-THRESHOLD u2004)
(define-constant ERR-POOL-ALREADY-EXISTS u2005)
(define-constant ERR-POOL-NOT-FOUND u2006)
(define-constant ERR-INVALID-HARVEST-INTERVAL u2007)
(define-constant ERR-INVALID-REBALANCE-THRESHOLD u2008)
(define-constant ERR-ORACLE-FAILURE u2009)
(define-constant ERR-INVALID-POOL-WEIGHT u2010)
(define-constant ERR-INVALID-STRATEGY u2011)
(define-constant ERR-PAUSED u2012)
(define-constant ERR-INVALID-AMOUNT u2013)
(define-constant ERR-INVALID-TIMESTAMP u2014)
(define-constant ERR-MAX-POOLS-EXCEEDED u2015)
(define-constant ERR-INVALID-POOL-TYPE u2016)
(define-constant ERR-INVALID-REWARD-TOKEN u2017)
(define-constant ERR-INVALID-DEPOSIT-TOKEN u2018)
(define-constant ERR-REBALANCE-NOT-NEEDED u2019)
(define-constant ERR-HARVEST-TOO-SOON u2020)

(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var min-harvest-interval uint u144)
(define-data-var rebalance-threshold uint u5)
(define-data-var next-pool-id uint u0)
(define-data-var max-pools uint u10)
(define-data-var total-allocated uint u0)

(define-map pools
  uint
  {
    pool-principal: principal,
    strategy: (string-utf8 50),
    weight: uint,
    last-harvest: uint,
    allocated-amount: uint,
    apy-threshold: uint,
    pool-type: (string-utf8 20),
    reward-token: principal,
    deposit-token: principal,
    active: bool
  }
)

(define-map pools-by-strategy
  (string-utf8 50)
  uint
)

(define-map harvest-history
  uint
  {
    pool-id: uint,
    timestamp: uint,
    rewards: uint,
    harvester: principal
  }
)

(define-read-only (get-pool (id uint))
  (map-get? pools id)
)

(define-read-only (get-harvest-history (id uint))
  (map-get? harvest-history id)
)

(define-read-only (is-pool-registered (strategy (string-utf8 50)))
  (is-some (map-get? pools-by-strategy strategy))
)

(define-private (validate-pool-principal (p principal))
  (if (not (is-eq p tx-sender))
    (ok true)
    (err ERR-INVALID-POOL)
  )
)

(define-private (validate-strategy (s (string-utf8 50)))
  (if (and (> (len s) u0) (<= (len s) u50))
    (ok true)
    (err ERR-INVALID-STRATEGY)
  )
)

(define-private (validate-weight (w uint))
  (if (and (> w u0) (<= w u100))
    (ok true)
    (err ERR-INVALID-POOL-WEIGHT)
  )
)

(define-private (validate-apy-threshold (t uint))
  (if (and (> t u0) (<= t u50))
    (ok true)
    (err ERR-INVALID-APY-THRESHOLD)
  )
)

(define-private (validate-pool-type (pt (string-utf8 20)))
  (if (or (is-eq pt "lp") (is-eq pt "staking") (is-eq pt "lending"))
    (ok true)
    (err ERR-INVALID-POOL-TYPE)
  )
)

(define-private (validate-token (t principal))
  (if (not (is-eq t tx-sender))
    (ok true)
    (err ERR-INVALID-REWARD-TOKEN)
  )
)

(define-private (validate-amount (a uint))
  (if (> a u0)
    (ok true)
    (err ERR-INVALID-AMOUNT)
  )
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-paused (new-paused bool))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (var-set paused new-paused)
    (ok true)
  )
)

(define-public (set-min-harvest-interval (new-interval uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-interval u0) (err ERR-INVALID-HARVEST-INTERVAL))
    (var-set min-harvest-interval new-interval)
    (ok true)
  )
)

(define-public (set-rebalance-threshold (new-threshold uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (and (> new-threshold u0) (<= new-threshold u20)) (err ERR-INVALID-REBALANCE-THRESHOLD))
    (var-set rebalance-threshold new-threshold)
    (ok true)
  )
)

(define-public (set-max-pools (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-MAX-POOLS-EXCEEDED))
    (var-set max-pools new-max)
    (ok true)
  )
)

(define-public (add-pool
  (pool-principal principal)
  (strategy (string-utf8 50))
  (weight uint)
  (apy-threshold uint)
  (pool-type (string-utf8 20))
  (reward-token principal)
  (deposit-token principal)
)
  (let (
    (next-id (var-get next-pool-id))
    (current-max (var-get max-pools))
  )
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (< next-id current-max) (err ERR-MAX-POOLS-EXCEEDED))
    (try! (validate-pool-principal pool-principal))
    (try! (validate-strategy strategy))
    (try! (validate-weight weight))
    (try! (validate-apy-threshold apy-threshold))
    (try! (validate-pool-type pool-type))
    (try! (validate-token reward-token))
    (try! (validate-token deposit-token))
    (asserts! (is-none (map-get? pools-by-strategy strategy)) (err ERR-POOL-ALREADY-EXISTS))
    (map-set pools next-id
      {
        pool-principal: pool-principal,
        strategy: strategy,
        weight: weight,
        last-harvest: block-height,
        allocated-amount: u0,
        apy-threshold: apy-threshold,
        pool-type: pool-type,
        reward-token: reward-token,
        deposit-token: deposit-token,
        active: true
      }
    )
    (map-set pools-by-strategy strategy next-id)
    (var-set next-pool-id (+ next-id u1))
    (print { event: "pool-added", id: next-id })
    (ok next-id)
  )
)

(define-public (remove-pool (pool-id uint))
  (let (
    (pool (map-get? pools pool-id))
  )
    (match pool p
      (begin
        (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (var-get paused)) (err ERR-PAUSED))
        (asserts! (get active p) (err ERR-POOL-NOT-FOUND))
        (try! (withdraw-from-pool pool-id (get allocated-amount p)))
        (map-set pools pool-id (merge p { active: false }))
        (map-delete pools-by-strategy (get strategy p))
        (print { event: "pool-removed", id: pool-id })
        (ok true)
      )
      (err ERR-POOL-NOT-FOUND)
    )
  )
)

(define-public (deploy-to-pool (pool-id uint) (amount uint))
  (let (
    (pool (map-get? pools pool-id))
  )
    (match pool p
      (begin
        (asserts! (contract-call? .vault is-admin tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (var-get paused)) (err ERR-PAUSED))
        (asserts! (get active p) (err ERR-POOL-NOT-FOUND))
        (try! (validate-amount amount))
        (let (
          (vault-balance (unwrap! (contract-call? .STABLECOIN get-balance (as-contract tx-sender)) (err ERR-INSUFFICIENT-FUNDS)))
        )
          (asserts! (>= vault-balance amount) (err ERR-INSUFFICIENT-FUNDS))
        )
        (try! (as-contract (contract-call? .STABLECOIN approve amount (get pool-principal p))))
        (try! (as-contract (contract-call? (get pool-principal p) stake amount)))
        (map-set pools pool-id (merge p { allocated-amount: (+ (get allocated-amount p) amount) }))
        (var-set total-allocated (+ (var-get total-allocated) amount))
        (print { event: "deployed-to-pool", pool-id: pool-id, amount: amount })
        (ok true)
      )
      (err ERR-POOL-NOT-FOUND)
    )
  )
)

(define-private (withdraw-from-pool (pool-id uint) (amount uint))
  (let (
    (pool (map-get? pools pool-id))
  )
    (match pool p
      (begin
        (asserts! (>= (get allocated-amount p) amount) (err ERR-INSUFFICIENT-FUNDS))
        (try! (as-contract (contract-call? (get pool-principal p) withdraw amount)))
        (map-set pools pool-id (merge p { allocated-amount: (- (get allocated-amount p) amount) }))
        (var-set total-allocated (- (var-get total-allocated) amount))
        (print { event: "withdrawn-from-pool", pool-id: pool-id, amount: amount })
        (ok true)
      )
      (err ERR-POOL-NOT-FOUND)
    )
  )
)

(define-public (harvest-from-pool (pool-id uint))
  (let (
    (pool (map-get? pools pool-id))
  )
    (match pool p
      (begin
        (asserts! (contract-call? .vault is-admin tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (var-get paused)) (err ERR-PAUSED))
        (asserts! (get active p) (err ERR-POOL-NOT-FOUND))
        (asserts! (>= (- block-height (get last-harvest p)) (var-get min-harvest-interval)) (err ERR-HARVEST-TOO-SOON))
        (let (
          (rewards (unwrap! (as-contract (contract-call? (get pool-principal p) harvest-rewards)) (err ERR-LOW-YIELD)))
        )
          (asserts! (> rewards u0) (err ERR-LOW-YIELD))
          (try! (as-contract (contract-call? (get reward-token p) transfer rewards (as-contract tx-sender) (as-contract tx-sender) none)))
          (try! (reinvest-rewards pool-id rewards))
          (map-set pools pool-id (merge p { last-harvest: block-height }))
          (let (
            (history-id (len (map-keys harvest-history)))
          )
            (map-set harvest-history history-id
              {
                pool-id: pool-id,
                timestamp: block-height,
                rewards: rewards,
                harvester: tx-sender
              }
            )
          )
          (print { event: "harvested-from-pool", pool-id: pool-id, rewards: rewards })
          (ok rewards)
        )
      )
      (err ERR-POOL-NOT-FOUND)
    )
  )
)

(define-private (reinvest-rewards (pool-id uint) (rewards uint))
  (let (
    (pool (unwrap! (map-get? pools pool-id) (err ERR-POOL-NOT-FOUND)))
  )
    (try! (deploy-to-pool pool-id rewards))
    (ok true)
  )
)

(define-public (rebalance-pool (pool-id uint))
  (let (
    (pool (map-get? pools pool-id))
  )
    (match pool p
      (begin
        (asserts! (is-eq tx-sender (var-get admin)) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (var-get paused)) (err ERR-PAUSED))
        (asserts! (get active p) (err ERR-POOL-NOT-FOUND))
        (let (
          (current-apy (unwrap! (contract-call? .oracle get-apy-for-pool (get pool-principal p)) (err ERR-ORACLE-FAILURE)))
        )
          (if (<= current-apy (var-get rebalance-threshold))
            (begin
              (try! (withdraw-from-pool pool-id (get allocated-amount p)))
              (map-set pools pool-id (merge p { active: false }))
              (print { event: "pool-rebalanced", pool-id: pool-id, reason: "low-apy" })
              (ok true)
            )
            (err ERR-REBALANCE-NOT-NEEDED)
          )
        )
      )
      (err ERR-POOL-NOT-FOUND)
    )
  )
)

(define-public (get-total-allocated)
  (ok (var-get total-allocated))
)

(define-public (get-pool-count)
  (ok (var-get next-pool-id))
)

(define-public (check-pool-existence (strategy (string-utf8 50)))
  (ok (is-pool-registered strategy))
)