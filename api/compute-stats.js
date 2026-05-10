/**
 * POST /api/compute-stats
 * Body: { addresses: string[], transactions: NormalizedTx[], transfers: NormalizedTransfer[] }
 *
 * Reçoit les données brutes déjà fetchées et calcule
 * toutes les statistiques sans rappeler Blockscout.
 * Léger et rapide — pas de risque de timeout.
 */

import { computeFullStats } from './_utils/stats.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Méthode non autorisée' })
  }

  const { addresses, transactions, transfers } = req.body ?? {}

  // Validation
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ message: 'addresses[] requis.' })
  }

  if (!Array.isArray(transactions)) {
    return res.status(400).json({ message: 'transactions[] requis.' })
  }

  if (addresses.length > 10) {
    return res.status(400).json({ message: 'Maximum 10 adresses.' })
  }

  try {
    const result = computeFullStats(
      addresses,
      transactions,
      transfers ?? []
    )

    // Pas de cache ici : les stats dépendent des données envoyées
    res.setHeader('Cache-Control', 'no-store')

    return res.status(200).json(result)
  } catch (error) {
    console.error('[compute-stats] Erreur:', error.message)
    return res.status(500).json({
      message: 'Erreur lors du calcul des statistiques.',
      detail:  error.message,
    })
  }
}
