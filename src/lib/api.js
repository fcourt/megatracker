const BASE = '/api'

/**
 * Lance l'analyse complète d'une liste d'adresses.
 * @param {string[]} addresses
 * @returns {Promise<object>} data structurée pour le Dashboard
 */
export async function analyzeWallets(addresses) {
  const res = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Erreur ${res.status}`)
  }
  return res.json()
}

/**
 * Récupère les transactions paginées d'une adresse.
 * @param {string} address
 * @param {number} page
 */
export async function fetchTransactions(address, page = 1) {
  const res = await fetch(
    `${BASE}/fetch-txs?address=${encodeURIComponent(address)}&page=${page}`
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Erreur ${res.status}`)
  }
  return res.json()
}

/**
 * Calcule les statistiques à partir de transactions brutes.
 * @param {string[]} addresses
 * @param {object[]} transactions
 */
export async function computeStats(addresses, transactions) {
  const res = await fetch(`${BASE}/compute-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses, transactions }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Erreur ${res.status}`)
  }
  return res.json()
}
