/**
 * Client Blockscout pour MegaETH
 * Base URL : https://megaeth.blockscout.com/api/v2
 */

const BASE_URL = 'https://megaeth.blockscout.com/api/v2'
const DELAY_MS = 150

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function bsFetch(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v)
  })

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  if (res.status === 429) {
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
 * Récupère les transactions d'une adresse.
 * NOTE : le paramètre filter "to | from" a été supprimé (422 sur Blockscout v9+)
 */
export async function getAddressTransactions(address, maxPages = 5) {
  const transactions = []
  let nextPageParams = null
  let page = 0

  while (page < maxPages) {
    // Pas de paramètre filter — Blockscout v9 retourne toutes les txs par défaut
    const params = { ...(nextPageParams ?? {}) }

    const data = await bsFetch(`/addresses/${address}/transactions`, params)
    await sleep(DELAY_MS)

    const items = data.items ?? []
    for (const tx of items) {
      transactions.push(normalizeTx(tx, address))
    }

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
 * Récupère les token transfers ERC-20 d'une adresse.
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
 * Infos d'un smart contract.
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
    return null
  }
}

/**
 * Résumé d'une adresse.
 */
export async function getAddressSummary(address) {
  const data = await bsFetch(`/addresses/${address}`)
  return {
    address,
    txCount:    data.transaction_count ?? 0,
    tokenCount: data.token_transfers_count ?? 0,
    isContract: data.is_contract ?? false,
    name:       data.name ?? null,
    ensName:    data.ens_domain_name ?? null,
  }
}

/* ── Normaliseurs ── */

function normalizeTx(tx, walletAddress) {
  const ts = tx.timestamp ? new Date(tx.timestamp) : null
  return {
    hash:            tx.hash,
    wallet:          walletAddress.toLowerCase(),
    blockNumber:     tx.block ?? null,
    timestamp:       ts?.toISOString() ?? null,
    date:            ts ? ts.toISOString().slice(0, 10) : null,
    from:            tx.from?.hash?.toLowerCase() ?? null,
    to:              tx.to?.hash?.toLowerCase() ?? null,
    value:           tx.value ?? '0',
    gasUsed:         parseInt(tx.gas_used ?? '0', 10),
    gasPrice:        tx.gas_price ?? '0',
    status:          tx.status === 'ok' ? 'success' : 'failed',
    method:          tx.method ?? null,
    contractAddress: tx.to?.is_contract ? tx.to.hash?.toLowerCase() : null,
    contractName:    tx.to?.name ?? null,
  }
}

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
