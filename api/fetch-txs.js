/**
 * GET /api/fetch-txs?address=0x...&page=1
 *
 * Récupère les transactions et token transfers d'une adresse
 * depuis Blockscout MegaETH.
 *
 * Conçu pour être appelé plusieurs fois côté client (pagination)
 * afin de rester sous le timeout Vercel de 10s.
 */

import {
  getAddressTransactions,
  getTokenTransfers,
  getAddressSummary,
} from './_utils/blockscout.js'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Méthode non autorisée' })
  }

  // Validation
  const { address, page = '1' } = req.query

  if (!address) {
    return res.status(400).json({ message: 'Paramètre address requis.' })
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ message: 'Adresse Ethereum invalide.' })
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1)

  // On récupère 1 page de txs par appel (≈50 txs) pour rester sous 10s
  // maxPages = 1 signifie qu'on fetch exactement une page Blockscout
  const MAX_PAGES_PER_CALL = 1

  try {
    // Lance les deux appels en parallèle
    const [transactions, transfers, summary] = await Promise.all([
      getAddressTransactions(address, MAX_PAGES_PER_CALL),
      getTokenTransfers(address, MAX_PAGES_PER_CALL),
      getAddressSummary(address),
    ])

    // Cache côté Vercel CDN : 60s (données fraîches mais pas re-fetchées à chaque requête)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')

    return res.status(200).json({
      address,
      page:         pageNum,
      summary,
      transactions,
      transfers,
      hasMore:      transactions.length >= 50,
      fetchedAt:    new Date().toISOString(),
    })
  } catch (error) {
    console.error(`[fetch-txs] Erreur pour ${address}:`, error.message)

    // Erreur Blockscout : on renvoie un message propre
    return res.status(502).json({
      message: `Impossible de récupérer les données pour ${address}.`,
      detail:  error.message,
    })
  }
}
