/**
 * Calcule toutes les statistiques à partir des transactions
 * et transfers normalisés récupérés via Blockscout + RPC.
 */

/**
 * Point d'entrée principal.
 *
 * @param {string[]}            addresses   - wallets analysés
 * @param {NormalizedTx[]}      allTxs      - toutes les transactions (multi-wallet)
 * @param {NormalizedTransfer[]} allTransfers - tous les token transfers
 * @returns {{ global: DashboardData, perWallet: Record<string, DashboardData> }}
 */
export function computeFullStats(addresses, allTxs, allTransfers) {
  const perWallet = {}

  for (const addr of addresses) {
    const lc = addr.toLowerCase()
    const txs = allTxs.filter((t) => t.wallet === lc)
    const transfers = allTransfers.filter((t) => t.wallet === lc)
    perWallet[lc] = computeWalletStats(lc, txs, transfers)
  }

  const seenHashes = new Set()
  const uniqueTxs = allTxs.filter((t) => {
    if (seenHashes.has(t.hash)) return false
    seenHashes.add(t.hash)
    return true
  })

  const seenTransferKeys = new Set()
  const uniqueTransfers = allTransfers.filter((t) => {
    const key = `${t.txHash}:${t.wallet}:${t.from}:${t.to}:${t.tokenAddress}:${t.amount}`
    if (seenTransferKeys.has(key)) return false
    seenTransferKeys.add(key)
    return true
  })

  const globalTxTimeSeries = buildMultiWalletTimeSeries(addresses, allTxs)

  const globalData = computeWalletStats('global', uniqueTxs, uniqueTransfers)
  globalData.txTimeSeries = globalTxTimeSeries

  return { global: globalData, perWallet }
}
/**
 * Calcule les stats d'un wallet individuel.
 *
 * @param {string}              address
 * @param {NormalizedTx[]}      txs
 * @param {NormalizedTransfer[]} transfers
 * @returns {DashboardData}
 */
function computeWalletStats(address, txs, transfers) {
  if (txs.length === 0) {
    return {
      stats: emptyStats(),
      txTimeSeries: [],
      swapTimeSeries: [],
      contracts: [],
      recentSwaps: [],
      swapsByProtocol: [],
    }
  }

  // ── Contrats uniques ──────────────────────────────────────
  const contractMap = new Map()
  for (const tx of txs) {
    if (!tx.contractAddress) continue
    const key = tx.contractAddress
    if (!contractMap.has(key)) {
      contractMap.set(key, {
        address: key,
        name: tx.contractName ?? null,
        txCount: 0,
        firstSeen: tx.date,
        lastSeen: tx.date,
        protocol: null,
      })
    }
    const c = contractMap.get(key)
    c.txCount++
    if (tx.date && tx.date < c.firstSeen) c.firstSeen = tx.date
    if (tx.date && tx.date > c.lastSeen) c.lastSeen = tx.date
  }

    const contracts = [...contractMap.values()].sort((a, b) => b.txCount - a.txCount)


  // ── Séries temporelles transactions ───────────────────────
  const txByDate = new Map()
  for (const tx of txs) {
    if (!tx.date) continue
    txByDate.set(tx.date, (txByDate.get(tx.date) ?? 0) + 1)
  }
  const txTimeSeries = buildTimeSeries(txByDate, 'total')

  // ── Détection des swaps (via transfers ERC-20 groupés par txHash) ──
  const swaps = detectSwaps(txs, transfers)

  // ── Séries temporelles swaps ──────────────────────────────
  const swapByDate = new Map()
  for (const s of swaps) {
    if (!s.date) continue
    const current = swapByDate.get(s.date) ?? { volumeUsd: 0, swapCount: 0 }
    current.volumeUsd += s.valueUsd ?? 0
    current.swapCount += 1
    swapByDate.set(s.date, current)
  }
  const swapTimeSeries = buildSwapTimeSeries(swapByDate)

  // ── Protocoles ────────────────────────────────────────────
  const protocolMap = new Map()
  for (const s of swaps) {
    const p = s.protocol ?? 'Unknown'
    protocolMap.set(p, (protocolMap.get(p) ?? 0) + 1)
  }
  const swapsByProtocol = [...protocolMap.entries()]
    .map(([protocol, count]) => ({ protocol, count }))
    .sort((a, b) => b.count - a.count)

  // ── Stats générales ───────────────────────────────────────
  const successTxs = txs.filter((t) => t.status === 'success')
  const dates = txs.map((t) => t.date).filter(Boolean).sort()
  const activeDays = new Set(dates).size
  const totalGasUsed = txs.reduce((s, t) => s + (t.gasUsed ?? 0), 0)
  const totalSwapVolumeUsd = swaps.reduce((s, sw) => s + (sw.valueUsd ?? 0), 0)


  const stats = {
    totalTx:             txs.length,
    totalSwaps:          swaps.length,
    totalSwapVolumeUsd:  Math.round(totalSwapVolumeUsd * 100) / 100,
    uniqueContracts:     contracts.length,
    activeDays,
    successRate:         txs.length > 0
                           ? Math.round((successTxs.length / txs.length) * 100)
                           : 0,
    totalGasUsed,
    uniqueProtocols:     protocolMap.size,
    firstTxDate:         dates[0] ?? null,
    lastTxDate:          dates[dates.length - 1] ?? null,
  }

  return {
    stats,
    txTimeSeries,
    swapTimeSeries,
    contracts,
    recentSwaps: swaps.slice(0, 50),
    swapsByProtocol,
  }
}

/* ── Détection des swaps ── */

/**
 * Extrait les swaps directement depuis le champ tx.swap
 * pré-calculé par blockscout.js lors de la normalisation.
 */
function detectSwaps(txs, transfers) {
  const txMap = new Map(
    txs.map((tx) => [tx.hash, tx])
  )

  const transfersByHash = new Map()
  for (const tr of transfers) {
    if (!tr.txHash) continue
    if (!transfersByHash.has(tr.txHash)) {
      transfersByHash.set(tr.txHash, [])
    }
    transfersByHash.get(tr.txHash).push(tr)
  }

  const swaps = []

  for (const [txHash, grouped] of transfersByHash.entries()) {
    const tx = txMap.get(txHash)
    if (!tx || tx.status !== 'success') continue

    const wallet = tx.wallet?.toLowerCase()
    if (!wallet) continue

    const outbound = grouped.filter((t) => t.from === wallet)
    const inbound = grouped.filter((t) => t.to === wallet)

    if (outbound.length === 0 || inbound.length === 0) continue

    const tokenOutTransfer = pickLargestTransfer(outbound)
    const tokenInTransfer = pickLargestTransfer(inbound)

    if (!tokenOutTransfer || !tokenInTransfer) continue
    if (tokenOutTransfer.tokenAddress === tokenInTransfer.tokenAddress) continue

    swaps.push(buildSwap(tx, wallet, tokenInTransfer, tokenOutTransfer))
  }

  return swaps.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
}

function pickLargestTransfer(transfers) {
  if (!transfers.length) return null

  return [...transfers].sort((a, b) => {
    const aAmount = toDecimal(a.amount, a.decimals)
    const bAmount = toDecimal(b.amount, b.decimals)
    return bAmount - aAmount
  })[0]
}

function buildSwap(tx, wallet, tokenInTransfer, tokenOutTransfer) {
  const amountIn = toDecimal(tokenInTransfer.amount, tokenInTransfer.decimals)
  const amountOut = toDecimal(tokenOutTransfer.amount, tokenOutTransfer.decimals)

  return {
    txHash: tx.hash,
    wallet,
    date: tx.date,
    timestamp: tx.timestamp,
    tokenIn: tokenInTransfer.tokenSymbol,
    tokenOut: tokenOutTransfer.tokenSymbol,
    amountIn,
    amountOut,
    valueUsd: estimateSwapValueUsd(tokenInTransfer, tokenOutTransfer),
    protocol: tx.contractName ?? 'Unknown',
  }
}

/* ── Helpers ── */

function emptyStats() {
  return {
    totalTx: 0, totalSwaps: 0, totalSwapVolumeUsd: 0,
    uniqueContracts: 0, activeDays: 0, successRate: 0,
    totalGasUsed: 0, uniqueProtocols: 0,
    firstTxDate: null, lastTxDate: null,
  }
}

function buildTimeSeries(dateMap, valueKey) {
  return [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, [valueKey]: v }))
}

function buildSwapTimeSeries(dateMap) {
  return [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, volumeUsd: Math.round(v.volumeUsd * 100) / 100, swapCount: v.swapCount }))
}

/**
 * Construit une série temporelle multi-wallet (une clé par adresse courte).
 */
function buildMultiWalletTimeSeries(addresses, allTxs) {
  if (addresses.length === 1) {
    // Vue mono-wallet : série simple avec clé "total"
    const m = new Map()
    for (const tx of allTxs) {
      if (tx.date) m.set(tx.date, (m.get(tx.date) ?? 0) + 1)
    }
    return buildTimeSeries(m, 'total')
  }

  // Vue multi-wallet : une clé par adresse abrégée
  const allDates = new Set()
  const walletMaps = {}

  for (const addr of addresses) {
    const lc = addr.toLowerCase()
    const key = `${addr.slice(0, 6)}…${addr.slice(-4)}`
    walletMaps[lc] = { key, map: new Map() }
  }

  for (const tx of allTxs) {
    if (!tx.date) continue
    allDates.add(tx.date)
    const wm = walletMaps[tx.wallet]
    if (wm) wm.map.set(tx.date, (wm.map.get(tx.date) ?? 0) + 1)
  }

  return [...allDates].sort().map((date) => {
    const entry = { date }
    for (const { key, map } of Object.values(walletMaps)) {
      entry[key] = map.get(date) ?? 0
    }
    return entry
  })
}

function toDecimal(rawAmount, decimals = 18) {
  try {
    return Number(BigInt(rawAmount)) / Math.pow(10, decimals)
  } catch {
    return 0
  }
}

/**
 * Estimation très simple de la valeur USD d'un swap.
 * En production, il faudrait appeler un oracle de prix (CoinGecko, etc.).
 * Ici on utilise des prix approximatifs pour les tokens communs.
 */
const PRICE_ESTIMATES = {
  WETH: 3200, ETH: 3200,
  USDC: 1,    USDT: 1,   DAI: 1,  USDS: 1,
  USDM: 1,     USDT0: 1,             // ← tokens natifs MegaETH
  WBTC: 65000, BTC: 65000,
  MEGA: 0.126,
}

function estimateSwapValueUsd(tokenIn, tokenOut) {
  const amountIn = toDecimal(tokenIn.amount, tokenIn.decimals)
  const amountOut = toDecimal(tokenOut.amount, tokenOut.decimals)

  const priceIn = PRICE_ESTIMATES[tokenIn.tokenSymbol?.toUpperCase()]
  const priceOut = PRICE_ESTIMATES[tokenOut.tokenSymbol?.toUpperCase()]

  if (priceIn != null && priceIn > 0) return amountIn * priceIn
  if (priceOut != null && priceOut > 0) return amountOut * priceOut
  return 0
}




/////////////////////////////////////////////////////////////////////////////////////


