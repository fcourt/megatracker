/**
 * Orchestre l'analyse complète d'un ou plusieurs wallets.
 * Gère la pagination et l'enrichissement des swaps en arrière-plan.
 *
 * @param {string[]} addresses
 * @param {function} onProgress - callback({ step, percent, message })
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeWallets(addresses, onProgress = () => {}) {

  // ── Phase 1 : fetch toutes les pages ──
  onProgress({ step: 'fetch', percent: 5, message: 'Récupération des transactions…' })

  let allTransactions = []
  let cursors = {}
  let page = 0

  do {
    const payload = { addresses }
    if (Object.keys(cursors).length > 0) payload.cursors = cursors

    const result = await apiFetch('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    allTransactions = [...allTransactions, ...(result.transactions ?? [])]
    cursors = result.cursors ?? {}
    page++

    onProgress({
      step: 'fetch',
      percent: Math.min(5 + page * 8, 35),
      message: `${allTransactions.length} transactions récupérées…`,
    })
  } while (Object.keys(cursors).length > 0 && page < 20)

  onProgress({ step: 'fetch', percent: 40, message: `${allTransactions.length} transactions au total` })

  // ── Phase 2 : enrichissement des swaps par batches de 10 ──
  const candidates = allTransactions.filter(         // ← allTransactions, pas transactions
    (tx) => tx.contractAddress !== null && tx.status === 'success'
  )

  const BATCH_SIZE = 10
  const enrichedSwaps = new Map()

  const byWallet = new Map()
  for (const tx of candidates) {
    if (!byWallet.has(tx.wallet)) byWallet.set(tx.wallet, [])
    byWallet.get(tx.wallet).push(tx.hash)
  }

  let processedCount = 0
  const totalCandidates = candidates.length

  for (const [wallet, hashes] of byWallet) {
    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batch = hashes.slice(i, i + BATCH_SIZE)

      const result = await apiFetch('/api/enrich-swaps', {
        method: 'POST',
        body: JSON.stringify({ hashes: batch, wallet }),
      })

      for (const { hash, swap } of result.swaps ?? []) {
        enrichedSwaps.set(hash, swap)
      }

      processedCount += batch.length
      const percent = 40 + Math.round((processedCount / totalCandidates) * 40)
      onProgress({
        step: 'enrich',
        percent,
        message: `Analyse des swaps… ${processedCount}/${totalCandidates}`,
      })
    }
  }

  // ── Fusionne les swaps dans les transactions ──
  const enrichedTransactions = allTransactions.map((tx) =>  // ← allTransactions
    enrichedSwaps.has(tx.hash)
      ? { ...tx, swap: enrichedSwaps.get(tx.hash) }
      : tx
  )

  onProgress({ step: 'compute', percent: 85, message: 'Calcul des statistiques…' })

  // ── Phase 3 : calcul des stats ──
  const stats = await apiFetch('/api/compute-stats', {
    method: 'POST',
    body: JSON.stringify({ addresses, transactions: enrichedTransactions }),
  })

  onProgress({ step: 'done', percent: 100, message: 'Analyse terminée' })

  return { ...stats }
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}
