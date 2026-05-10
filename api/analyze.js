/**
 * POST /api/analyze
 * Body: { addresses: string[] }
 *
 * Fonction principale — orchestre le fetch + le calcul en un seul appel.
 * Appelée par App.jsx au moment du submit du formulaire.
 *
 * Stratégie :
 * 1. Fetch parallèle des txs de chaque wallet (Promise.all)
 * 2. Calcul des stats via computeFullStats
 * 3. Renvoie la structure complète attendue par Dashboard.jsx
 *
 * Si un wallet échoue, on l'inclut quand même avec des données vides
 * plutôt que de faire échouer toute l'analyse.
 */

import {
  getAddressTransactions,
  getTokenTransfers,
  getAddressSummary,
} from './_utils/blockscout.js'
import { computeFullStats } from './_utils/stats.js'

// Nombre max de pages Blockscout par wallet par appel
// 2 pages ≈ 100 txs max par wallet — équilibre vitesse / complétude
const MAX_PAGES = 2

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Méthode non autorisée' })
  }

  const { addresses } = req.body ?? {}

  // ── Validation ──────────────────────────────────────────
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ message: 'Fournissez au moins une adresse.' })
  }

  if (addresses.length > 10) {
    return res.status(400).json({ message: 'Maximum 10 adresses par analyse.' })
  }

  const invalidAddresses = addresses.filter(
    (a) => !/^0x[0-9a-fA-F]{40}$/.test(a?.trim())
  )
  if (invalidAddresses.length > 0) {
    return res.status(400).json({
      message: `Adresse(s) invalide(s) : ${invalidAddresses.join(', ')}`,
    })
  }

  const normalizedAddresses = addresses.map((a) => a.trim().toLowerCase())

  // ── Fetch parallèle ─────────────────────────────────────
  console.log(`[analyze] Analyse de ${normalizedAddresses.length} wallet(s)…`)
  const startTime = Date.now()

  const walletResults = await Promise.all(
    normalizedAddresses.map((addr) => fetchWalletData(addr))
  )

  // Sépare les succès des échecs
  const errors = walletResults.filter((r) => r.error)
  if (errors.length > 0) {
    console.warn(
      `[analyze] ${errors.length} wallet(s) en erreur :`,
      errors.map((e) => `${e.address}: ${e.error}`)
    )
  }

  // Agrège toutes les transactions et transfers
  const allTransactions = walletResults.flatMap((r) => r.transactions ?? [])
  const allTransfers    = walletResults.flatMap((r) => r.transfers    ?? [])
  const summaries       = Object.fromEntries(
    walletResults.map((r) => [r.address, r.summary])
  )

  console.log(
    `[analyze] ${allTransactions.length} txs, ${allTransfers.length} transfers — ` +
    `${Date.now() - startTime}ms`
  )

  // ── Calcul des stats ─────────────────────────────────────
  let result
  try {
    result = computeFullStats(normalizedAddresses, allTransactions, allTransfers)
  } catch (error) {
    console.error('[analyze] Erreur computeFullStats:', error.message)
    return res.status(500).json({
      message: 'Erreur lors du calcul des statistiques.',
      detail:  error.message,
    })
  }

  // ── Enrichissement de la réponse ─────────────────────────
  // Ajoute les summaries Blockscout (balance, ENS, etc.)
  for (const addr of normalizedAddresses) {
    if (result.perWallet[addr]) {
      result.perWallet[addr].summary = summaries[addr] ?? null
    }
  }

  // Ajoute les wallets en erreur dans les meta
  result.meta = {
    analyzedAt:   new Date().toISOString(),
    durationMs:   Date.now() - startTime,
    walletCount:  normalizedAddresses.length,
    txCount:      allTransactions.length,
    transferCount: allTransfers.length,
    errors:       errors.map((e) => ({ address: e.address, reason: e.error })),
  }

  // Cache court : les données on-chain bougent vite sur MegaETH
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  return res.status(200).json(result)
}

/* ── Fetch d'un wallet avec fallback silencieux ── */

async function fetchWalletData(address) {
  try {
    const [transactions, transfers, summary] = await Promise.all([
      getAddressTransactions(address, MAX_PAGES),
      getTokenTransfers(address, MAX_PAGES),
      getAddressSummary(address),
    ])

    return { address, transactions, transfers, summary, error: null }
  } catch (error) {
    console.error(`[analyze] Échec fetch wallet ${address}:`, error.message)

    // On retourne des données vides plutôt que de bloquer toute l'analyse
    return {
      address,
      transactions: [],
      transfers:    [],
      summary:      null,
      error:        error.message,
    }
  }
}
