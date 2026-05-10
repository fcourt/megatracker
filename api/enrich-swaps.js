/**
 * POST /api/enrich-swaps
 * Body: { hashes: string[], wallet: string }
 *
 * Enrichit un batch de transactions avec leurs token_transfers
 * pour détecter les swaps.
 *
 * Limité à 10 hashes par appel pour rester sous 10s.
 * Le client appelle cette fonction en boucle jusqu'à épuisement.
 */

import { bsFetch, extractSwapFromTx, DELAY_MS, sleep } from './_utils/blockscout.js'

const MAX_BATCH = 10

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')
    return res.status(405).json({ message: 'Méthode non autorisée' })

  const { hashes, wallet } = req.body ?? {}

  if (!Array.isArray(hashes) || !wallet) {
    return res.status(400).json({ message: 'hashes[] et wallet requis.' })
  }

  const batch = hashes.slice(0, MAX_BATCH)
  const swaps = []

  for (const hash of batch) {
    try {
      const detail = await bsFetch(`/transactions/${hash}`)
      await sleep(DELAY_MS)

      const swap = extractSwapFromTx(detail, wallet.toLowerCase())
      if (swap) {
        swaps.push({ hash, swap })
      }
    } catch (err) {
      console.warn(`[enrich-swaps] Échec ${hash}:`, err.message)
    }
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ swaps, processed: batch.length })
}
