/**
 * Client Blockscout pour MegaETH
 * Base URL : https://megaeth.blockscout.com/api/v2
 */

const BASE_URL = 'https://megaeth.blockscout.com/api/v2'
export const DELAY_MS = 150

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function bsFetch(path, params = {}) {
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
// api/_utils/blockscout.js
export async function getAddressTransactions(address, maxPages = 1, initialPageParams = null) {
  const transactions = []
  let nextPageParams = initialPageParams  // ← reprend depuis le curseur client
  let page = 0

  while (page < maxPages) {
    const params = { ...(nextPageParams ?? {}) }
    const data = await bsFetch(`/addresses/${address}/transactions`, params)
    await sleep(DELAY_MS)

    for (const tx of data.items ?? []) {
      transactions.push(normalizeTx(tx, address))
    }

    if (data.next_page_params && Object.keys(data.next_page_params).length > 0) {
      nextPageParams = data.next_page_params
      page++
    } else {
      nextPageParams = null
      break
    }
  }

  // Retourne aussi le curseur pour la prochaine page
  return { transactions, nextPageParams }
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

/**
 * Normalise une transaction Blockscout v2.
 * Extrait maintenant les infos de swap directement depuis token_transfers.
 */
function normalizeTx(tx, walletAddress) {
  const ts = tx.timestamp ? new Date(tx.timestamp) : null
  const wallet = walletAddress.toLowerCase()

  // Nom du DEX depuis les metadata OLI (Open Labels Initiative)
  const dexName = tx.to?.metadata?.tags?.find(
    (t) => t.slug === 'swap-router-02' ||
           t.slug === 'swap-router'    ||
           t.tagType === 'name'
  )?.name ?? tx.to?.name ?? null

  return {
    hash:            tx.hash,
    wallet,
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
    contractName:    dexName,                        // ← nom du DEX depuis OLI
    ethPriceUsd:     tx.exchange_rate
                       ? parseFloat(tx.exchange_rate)
                       : null,                       // ← prix ETH au moment de la tx
    // Swap détecté inline si token_transfers présents
    swap:            extractSwapFromTx(tx, wallet),
  }
}

/**
 * Extrait les données de swap directement depuis token_transfers d'une tx.
 * Retourne null si ce n'est pas un swap.
 *
 * Logique :
 * - Au moins 2 token transfers
 * - Un transfer SORTANT du wallet (token vendu)
 * - Un transfer ENTRANT vers le wallet (token reçu)
 *
 * @param {object} tx
 * @param {string} wallet - adresse normalisée en lowercase
 * @returns {SwapData|null}
 */
export function extractSwapFromTx(tx, wallet) {
  const transfers = tx.token_transfers ?? []
  if (transfers.length < 2) return null

  const outbound = transfers.filter(
    (t) => t.from?.hash?.toLowerCase() === wallet
  )
  const inbound = transfers.filter(
    (t) => t.to?.hash?.toLowerCase() === wallet
  )

  if (outbound.length === 0 || inbound.length === 0) return null

  const tokenOut = outbound[0]   // token envoyé (vendu)
  const tokenIn  = inbound[inbound.length - 1]  // token reçu (acheté)

  // Montants humains
  const decimalsOut = parseInt(tokenOut.token?.decimals ?? '18', 10)
  const decimalsIn  = parseInt(tokenIn.token?.decimals  ?? '18', 10)
  const amountOut   = toDecimal(tokenOut.total?.value ?? '0', decimalsOut)
  const amountIn    = toDecimal(tokenIn.total?.value  ?? '0', decimalsIn)

  // Prix par token depuis Blockscout (exchange_rate = prix USD au moment de la tx)
  const priceOut = tokenOut.token?.exchange_rate
    ? parseFloat(tokenOut.token.exchange_rate) : null
  const priceIn  = tokenIn.token?.exchange_rate
    ? parseFloat(tokenIn.token.exchange_rate)  : null

  // Volume USD : on prend le token dont on a le prix, priorité au token vendu
  const volumeUsd = priceOut != null && priceOut > 0
    ? amountOut * priceOut
    : priceIn  != null && priceIn  > 0
    ? amountIn  * priceIn
    : null

  // Nom du DEX : metadata OLI > nom du contrat destination
  const dexName =
    tx.to?.metadata?.tags?.find((t) => t.tagType === 'name')?.name ??
    tx.to?.name ??
    'DEX inconnu'

  return {
    tokenSold:     tokenOut.token?.symbol ?? '?',
    tokenBought:   tokenIn.token?.symbol  ?? '?',
    amountSold:    amountOut,
    amountBought:  amountIn,
    priceSoldUsd:  priceOut,
    priceBoughtUsd:priceIn,
    volumeUsd:     volumeUsd != null ? Math.round(volumeUsd * 100) / 100 : null,
    protocol:      dexName,
    tokenSoldAddr:    tokenOut.token?.address_hash?.toLowerCase() ?? null,
    tokenBoughtAddr:  tokenIn.token?.address_hash?.toLowerCase()  ?? null,
  }
}

function toDecimal(rawAmount, decimals = 18) {
  try {
    return Number(BigInt(rawAmount)) / Math.pow(10, decimals)
  } catch {
    return 0
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
