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
// Ajoute cet import en haut de api/_utils/stats.js
import { KNOWN_DEX_CONTRACTS } from './rpc.js'

export function computeFullStats(addresses, allTxs, allTransfers) {
  const perWallet = {}

  for (const addr of addresses) {
    const lc = addr.toLowerCase()
    const txs = allTxs.filter((t) => t.wallet === lc)
    const transfers = allTransfers.filter((t) => t.wallet === lc)
    perWallet[addr] = computeWalletStats(lc, txs, transfers)
  }

  // Agrégation globale : déduplique les txs par hash
  const seenHashes = new Set()
  const uniqueTxs = allTxs.filter((t) => {
    if (seenHashes.has(t.hash)) return false
    seenHashes.add(t.hash)
    return true
  })

  const seenTransferHashes = new Set()
  const uniqueTransfers = allTransfers.filter((t) => {
    if (seenTransferHashes.has(t.txHash)) return false
    seenTransferHashes.add(t.txHash)
    return true
  })

  // Pour le graphique global de transactions, on superpose une courbe par wallet
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
        address:   key,
        name:      tx.contractName ?? null,
        txCount:   0,
        firstSeen: tx.date,
        lastSeen:  tx.date,
        protocol:  null,
      })
    }
    const c = contractMap.get(key)
    c.txCount++
    if (tx.date && tx.date < c.firstSeen) c.firstSeen = tx.date
    if (tx.date && tx.date > c.lastSeen)  c.lastSeen  = tx.date
  }
  const contracts = [...contractMap.values()]
    .sort((a, b) => b.txCount - a.txCount)

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
 * Détecte les swaps via deux méthodes combinées :
 * 1. Transactions envoyées à un routeur DEX connu
 * 2. Transactions où le wallet a émis ET reçu des ERC-20 différents (même txHash)
 */
function detectSwaps(txs, transfers) {
  // Groupe les transfers par txHash
  const transfersByTx = new Map()
  for (const t of transfers) {
    if (!transfersByTx.has(t.txHash)) transfersByTx.set(t.txHash, [])
    transfersByTx.get(t.txHash).push(t)
  }

  const swaps = []
  const txMap = new Map(txs.map((t) => [t.hash, t]))
  const processedHashes = new Set()

  // Méthode 1 : tx vers un routeur DEX connu
  for (const tx of txs) {
    if (!tx.contractAddress) continue
    const knownProtocol = KNOWN_DEX_CONTRACTS[tx.contractAddress.toLowerCase()]
    if (!knownProtocol || knownProtocol === 'WETH') continue
    if (processedHashes.has(tx.hash)) continue

    const txTransfers = transfersByTx.get(tx.hash) ?? []
    const wallet = tx.wallet
    const outbound = txTransfers.filter((t) => t.from === wallet)
    const inbound  = txTransfers.filter((t) => t.to   === wallet)

    if (outbound.length > 0 && inbound.length > 0) {
      processedHashes.add(tx.hash)
      swaps.push(buildSwap(tx.hash, wallet, outbound[0], inbound[inbound.length - 1], knownProtocol))
    } else if (txTransfers.length === 0) {
      // Swap natif ETH → token ou token → ETH sans transfers ERC-20 visibles
      processedHashes.add(tx.hash)
      swaps.push({
        txHash:    tx.hash,
        wallet,
        date:      tx.date,
        timestamp: tx.timestamp,
        tokenIn:   'ETH',
        tokenOut:  '?',
        amountIn:  toDecimal(tx.value, 18),
        amountOut: 0,
        valueUsd:  toDecimal(tx.value, 18) * 3200, // estimation ETH
        protocol:  knownProtocol,
      })
    }
  }

  // Méthode 2 : transfers ERC-20 in + out dans le même tx (DEX inconnu)
  for (const [txHash, txTransfers] of transfersByTx) {
    if (processedHashes.has(txHash)) continue
    if (txTransfers.length < 2) continue

    const wallet = txTransfers[0].wallet
    const outbound = txTransfers.filter((t) => t.from === wallet)
    const inbound  = txTransfers.filter((t) => t.to   === wallet)

    if (outbound.length === 0 || inbound.length === 0) continue

    const tx = txMap.get(txHash)
    processedHashes.add(txHash)

    swaps.push(buildSwap(
      txHash,
      wallet,
      outbound[0],
      inbound[inbound.length - 1],
      tx?.contractName ?? 'DEX inconnu'
    ))
  }

  return swaps.sort((a, b) =>
    (b.timestamp ?? '') > (a.timestamp ?? '') ? 1 : -1
  )
}

function buildSwap(txHash, wallet, tokenInTransfer, tokenOutTransfer, protocol) {
  return {
    txHash,
    wallet,
    date:      tokenInTransfer.date,
    timestamp: tokenInTransfer.timestamp,
    tokenIn:   tokenInTransfer.tokenSymbol,
    tokenOut:  tokenOutTransfer.tokenSymbol,
    amountIn:  toDecimal(tokenInTransfer.amount, tokenInTransfer.decimals),
    amountOut: toDecimal(tokenOutTransfer.amount, tokenOutTransfer.decimals),
    valueUsd:  estimateSwapValueUsd(tokenInTransfer, tokenOutTransfer),
    protocol,
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
  const amountIn  = toDecimal(tokenIn.amount, tokenIn.decimals)
  const amountOut = toDecimal(tokenOut.amount, tokenOut.decimals)

  const priceIn  = PRICE_ESTIMATES[tokenIn.tokenSymbol?.toUpperCase()]
  const priceOut = PRICE_ESTIMATES[tokenOut.tokenSymbol?.toUpperCase()]

  if (priceIn  != null && priceIn  > 0) return amountIn  * priceIn
  if (priceOut != null && priceOut > 0) return amountOut * priceOut
  return 0
}
