/**
 * Client Blockscout pour MegaETH
 * Doc : https://megaeth.blockscout.com/api/v2
 *
 * Toutes les fonctions retournent des données normalisées.
 * En cas d'erreur réseau ou de rate-limit, on throw avec un message clair.
 */

const BASE_URL = 'https://megaeth.blockscout.com/api/v2'

// Délai entre les appels pour éviter le rate-limit (ms)
const DELAY_MS = 120

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch générique avec gestion d'erreurs.
 */
async function bsFetch(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v)
  })

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (res.status === 429) {
    // Rate-limit : on attend et on réessaie une fois
    await sleep(1500)
    const retry = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (!retry.ok) throw new Error(`Blockscout rate-limit persistant sur ${path}`)
    return retry.json()
  }

  if (!res.ok) {
    throw new Error(`Blockscout ${res.status} sur ${path}`)
  }

  return res.json()
}

/**
 * Récupère toutes les transactions d'une adresse (pagination automatique).
 * Limite à maxPages pour rester sous le timeout Vercel (10s).
 *
 * @param {string} address  - Adresse 0x...
 * @param {number} maxPages - Nombre max de pages (défaut 5 = ~250 txs)
 * @returns {Promise<NormalizedTx[]>}
 */
export async function getAddressTransactions(address, maxPages = 5) {
  const transactions = []
  let nextPageParams = null
  let page = 0

  while (page < maxPages) {
    const params = {
      filter: 'to | from',
      ...(nextPageParams ?? {}),
    }

    const data = await bsFetch(`/addresses/${address}/transactions`, params)
    await sleep(DELAY_MS)

    const items = data.items ?? []
    for (const tx of items) {
      transactions.push(normalizeTx(tx, address))
    }

    // Blockscout v2 utilise next_page_params pour la pagination keyset
    if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
      nextPageParams = data.next_page_params
      page++
    } else {
      break
    }
  }

  return transactions
}

/**
 * Récupère les token transfers (ERC-20) d'une adresse.
 * Utile pour détecter les swaps et calculer les volumes.
 *
 * @param {string} address
 * @param {number} maxPages
 * @returns {Promise<NormalizedTransfer[]>}
 */
export async function getTokenTransfers(address, maxPages = 3) {
  const transfers = []
  let nextPageParams = null
  let page = 0

  while (page < maxPages) {
    const params = {
      type: 'ERC-20',
      ...(nextPageParams ?? {}),
    }

    const data = await bsFetch(`/addresses/${address}/token-transfers`, params)
    await sleep(DELAY_MS)

    const items = data.items ?? []
    for (const t of items) {
      transfers.push(normalizeTransfer(t, address))
    }

    if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
      nextPageParams = data.next_page_params
      page++
    } else {
      break
    }
  }

  return transfers
}

/**
 * Récupère les infos d'un smart contract (nom, ABI, protocole).
 *
 * @param {string} address
 * @returns {Promise<ContractInfo|null>}
 */
export async function getContractInfo(address) {
  try {
    const data = await bsFetch(`/smart-contracts/${address}`)
    return {
      address,
      name: data.name ?? null,
      verified: data.is_verified ?? false,
      compiler: data.compiler_version ?? null,
    }
  } catch {
    // Contrat non vérifié ou adresse EOA — pas bloquant
    return null
  }
}

/**
 * Récupère le résumé d'une adresse (balance, tx count, etc.)
 *
 * @param {string} address
 * @returns {Promise<AddressSummary>}
 */
export async function getAddressSummary(address) {
  const data = await bsFetch(`/addresses/${address}`)
  return {
    address,
    txCount:       data.transaction_count ?? 0,
    tokenCount:    data.token_transfers_count ?? 0,
    isContract:    data.is_contract ?? false,
    name:          data.name ?? null,
    ensName:       data.ens_domain_name ?? null,
  }
}

/* ── Normaliseurs ── */

/**
 * Normalise une transaction Blockscout v2.
 * @param {object} tx
 * @param {string} walletAddress
 * @returns {NormalizedTx}
 */
function normalizeTx(tx, walletAddress) {
  const ts = tx.timestamp ? new Date(tx.timestamp) : null

  return {
    hash:        tx.hash,
    wallet:      walletAddress.toLowerCase(),
    blockNumber: tx.block ?? null,
    timestamp:   ts?.toISOString() ?? null,
    date:        ts ? ts.toISOString().slice(0, 10) : null,
    from:        tx.from?.hash?.toLowerCase() ?? null,
    to:          tx.to?.hash?.toLowerCase() ?? null,
    value:       tx.value ?? '0',
    gasUsed:     parseInt(tx.gas_used ?? '0', 10),
    gasPrice:    tx.gas_price ?? '0',
    status:      tx.status === 'ok' ? 'success' : 'failed',
    method:      tx.method ?? null,
    // Le destinataire est considéré comme un contrat interagi
    contractAddress: tx.to?.is_contract ? tx.to.hash?.toLowerCase() : null,
    contractName:    tx.to?.name ?? null,
  }
}

/**
 * Normalise un token transfer Blockscout v2.
 * @param {object} t
 * @param {string} walletAddress
 * @returns {NormalizedTransfer}
 */
function normalizeTransfer(t, walletAddress) {
  const ts = t.timestamp ? new Date(t.timestamp) : null

  return {
    txHash:       t.tx_hash,
    wallet:       walletAddress.toLowerCase(),
    timestamp:    ts?.toISOString() ?? null,
    date:         ts ? ts.toISOString().slice(0, 10) : null,
    from:         t.from?.hash?.toLowerCase() ?? null,
    to:           t.to?.hash?.toLowerCase() ?? null,
    tokenSymbol:  t.token?.symbol ?? 'UNKNOWN',
    tokenAddress: t.token?.address?.toLowerCase() ?? null,
    amount:       t.total?.value ?? '0',
    decimals:     parseInt(t.token?.decimals ?? '18', 10),
  }
}
