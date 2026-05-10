// api/analyze.js — version complète avec curseurs

import {
  getAddressTransactions,
  getAddressSummary,
} from './_utils/blockscout.js'

const MAX_PAGES_PER_CALL = 1

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Méthode non autorisée' })
  }

  const { addresses, cursors = {} } = req.body ?? {}

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
  const startTime = Date.now()

  // ── Fetch parallèle avec curseurs ───────────────────────
  // cursors = { "0xabc...": { block_number: ..., index: ... } }
  // Si pas de curseur pour une adresse → première page
  const walletResults = await Promise.all(
    normalizedAddresses.map((addr) =>
      fetchWalletPage(addr, cursors[addr] ?? null)
    )
  )

  // ── Collecte transactions + curseurs suivants ────────────
  const allTransactions = []
  const nextCursors = {}
  const summaries = {}
  const errors = []

  for (const result of walletResults) {
    if (result.error) {
      errors.push({ address: result.address, reason: result.error })
      continue
    }

    allTransactions.push(...(result.transactions ?? []))

    // Si ce wallet a encore des pages → conserve le curseur
    if (result.nextPageParams) {
      nextCursors[result.address] = result.nextPageParams
    }

    if (result.summary) {
      summaries[result.address] = result.summary
    }
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  // ── Réponse ─────────────────────────────────────────────
  return res.status(200).json({
    transactions: allTransactions,
    summaries,
    hasMore: Object.keys(nextCursors).length > 0,
    cursors:  nextCursors,  // ← renvoyé au client pour l'appel suivant
    meta: {
      analyzedAt:  new Date().toISOString(),
      durationMs:  Date.now() - startTime,
      walletCount: normalizedAddresses.length,
      txCount:     allTransactions.length,
      errors,
    },
  })
}

// ── Fetch d'une page pour un wallet ─────────────────────────

async function fetchWalletPage(address, pageParams = null) {
  try {
    const [{ transactions, nextPageParams }, summary] = await Promise.all([
      getAddressTransactions(address, MAX_PAGES_PER_CALL, pageParams),
      // Summary seulement sur la première page pour éviter les appels inutiles
      pageParams === null ? getAddressSummary(address) : Promise.resolve(null),
    ])

    return { address, transactions, nextPageParams, summary, error: null }
  } catch (error) {
    console.error(`[analyze] Échec wallet ${address}:`, error.message)
    return {
      address,
      transactions:   [],
      nextPageParams: null,
      summary:        null,
      error:          error.message,
    }
  }
}
