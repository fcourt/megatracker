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

  const txByDate = new Map()
  for (const tx of txs) {
    if (!tx.date) continue
    txByDate.set(tx.date, (txByDate.get(tx.date) ?? 0) + 1)
  }
  const txTimeSeries = buildTimeSeries(txByDate, 'total')

  const swaps = detectSwaps(txs, transfers)

  const swapByDate = new Map()
  for (const s of swaps) {
    if (!s.date) continue
    const current = swapByDate.get(s.date) ?? { volumeUsd: 0, swapCount: 0 }
    current.volumeUsd += s.valueUsd ?? 0
    current.swapCount += 1
    swapByDate.set(s.date, current)
  }
  const swapTimeSeries = buildSwapTimeSeries(swapByDate)

  const protocolMap = new Map()
  for (const s of swaps) {
    const p = s.protocol ?? 'Unknown'
    protocolMap.set(p, (protocolMap.get(p) ?? 0) + 1)
  }
  const swapsByProtocol = [...protocolMap.entries()]
    .map(([protocol, count]) => ({ protocol, count }))
    .sort((a, b) => b.count - a.count)

  const successTxs = txs.filter((t) => t.status === 'success')
  const dates = txs.map((t) => t.date).filter(Boolean).sort()
  const activeDays = new Set(dates).size
  const totalGasUsed = txs.reduce((s, t) => s + (t.gasUsed ?? 0), 0)
  const totalSwapVolumeUsd = swaps.reduce((s, sw) => s + (sw.valueUsd ?? 0), 0)

  const stats = {
    totalTx: txs.length,
    totalSwaps: swaps.length,
    totalSwapVolumeUsd: Math.round(totalSwapVolumeUsd * 100) / 100,
    uniqueContracts: contracts.length,
    activeDays,
    successRate: txs.length > 0
      ? Math.round((successTxs.length / txs.length) * 100)
      : 0,
    totalGasUsed,
    uniqueProtocols: protocolMap.size,
    firstTxDate: dates[0] ?? null,
    lastTxDate: dates[dates.length - 1] ?? null,
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
