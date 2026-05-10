// api/analyze.js

import {
  getAddressTransactions,
  getAddressSummary,
  getTokenTransfers,
} from './_utils/blockscout.js'

const MAX_PAGES_PER_CALL = 1
const MAX_TRANSFER_PAGES = 3

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Méthode non autorisée' })
  }

  const { addresses, cursors = {} } = req.body ?? {}

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

  const walletResults = await Promise.all(
    normalizedAddresses.map((addr) =>
      fetchWalletPage(addr, cursors[addr] ?? null)
    )
  )

  const allTransactions = []
  const allTransfers = []
  const nextCursors = {}
  const summaries = {}
  const errors = []

  for (const result of walletResults) {
    if (result.error) {
      errors.push({ address: result.address, reason: result.error })
      continue
    }

    allTransactions.push(...(result.transactions ?? []))
    allTransfers.push(...(result.transfers ?? []))

    if (result.nextPageParams) {
      nextCursors[result.address] = result.nextPageParams
    }

    if (result.summary) {
      summaries[result.address] = result.summary
    }
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  return res.status(200).json({
    transactions: allTransactions,
    transfers: allTransfers,
    summaries,
    hasMore: Object.keys(nextCursors).length > 0,
    cursors: nextCursors,
    meta: {
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      walletCount: normalizedAddresses.length,
      txCount: allTransactions.length,
      transferCount: allTransfers.length,
      errors,
    },
  })
}

async function fetchWalletPage(address, pageParams = null) {
  try {
    const [{ transactions, nextPageParams }, summary, transfers] = await Promise.all([
      getAddressTransactions(address, MAX_PAGES_PER_CALL, pageParams),
      pageParams === null ? getAddressSummary(address) : Promise.resolve(null),
      getTokenTransfers(address, MAX_TRANSFER_PAGES),
    ])

    return {
      address,
      transactions,
      transfers,
      nextPageParams,
      summary,
      error: null,
    }
  } catch (error) {
    console.error(`[analyze] Échec wallet ${address}:`, error.message)
    return {
      address,
      transactions: [],
      transfers: [],
      nextPageParams: null,
      summary: null,
      error: error.message,
    }
  }
}
