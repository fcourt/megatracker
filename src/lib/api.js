/**
 * Orchestre l'analyse complète d'un ou plusieurs wallets.
 * Gère la pagination et l'enrichissement des swaps en arrière-plan.
 *
 * @param {string[]} addresses
 * @param {function} onProgress - callback({ step, percent, message })
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeWallets(addresses, onProgress = () => {}) {

  // ── Phase 1 : listing des transactions ──
  onProgress({ step: 'fetch', percent: 10, message: 'Récupération des transactions…' })

  const { transactions, summaries, meta } = await apiFetch('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ addresses }),
  })

  onProgress({ step: 'fetch', percent: 40, message: `${transactions.length} transactions récupérées` })

  // ── Phase 2 : enrichissement des swaps par batches de 10 ──
  const candidates = transactions.filter(
    (tx) => tx.contractAddress !== null && tx.status === 'success'
  )

  const BATCH_SIZE = 10
  const enrichedSwaps = new Map()  // hash → swap

  // Groupe les candidats par wallet pour l'appel
  const byWallet = new Map()
  for (const tx of candidates) {
    if (!byWallet.has(tx.wallet)) byWallet.set(tx.wallet, [])
    byWallet.get(tx.wallet).push(tx.hash)
  }

  let processedCount = 0
  const totalCandidates = candidates.length

  for (const [wallet, hashes] of byWallet) {
    // Découpe en batches
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
  const enrichedTransactions = transactions.map((tx) =>
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

  return { ...stats, meta }
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
