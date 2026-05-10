/**
 * Client JSON-RPC MegaETH
 * Endpoint public : https://carrot.megaeth.com/rpc
 *
 * Utilisé pour les données que Blockscout ne couvre pas :
 * - receipts détaillés (logs bruts, gas précis)
 * - lecture de state
 * - vérification de blocs récents
 */

const RPC_URL = 'https://carrot.megaeth.com/rpc'

let _reqId = 1

/**
 * Appel JSON-RPC générique.
 *
 * @param {string} method   - ex: 'eth_getTransactionReceipt'
 * @param {any[]}  params   - paramètres de la méthode
 * @returns {Promise<any>}  - champ `result` de la réponse
 */
export async function rpcCall(method, params = []) {
  const body = {
    jsonrpc: '2.0',
    id: _reqId++,
    method,
    params,
  }

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status} sur ${method}`)
  }

  const json = await res.json()

  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)
  }

  return json.result
}

/**
 * Batch de plusieurs appels RPC en une seule requête HTTP.
 * Idéal pour récupérer plusieurs receipts d'un coup.
 *
 * @param {{ method: string, params: any[] }[]} calls
 * @returns {Promise<any[]>} - tableau de `result` dans le même ordre
 */
export async function rpcBatch(calls) {
  if (calls.length === 0) return []

  const body = calls.map((c) => ({
    jsonrpc: '2.0',
    id: _reqId++,
    method: c.method,
    params: c.params,
  }))

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`RPC batch HTTP ${res.status}`)
  }

  const results = await res.json()

  // Remet dans l'ordre par id
  const sorted = [...results].sort((a, b) => a.id - b.id)
  return sorted.map((r) => {
    if (r.error) {
      console.warn(`RPC batch error sur ${r.id}: ${r.error.message}`)
      return null
    }
    return r.result
  })
}

/* ── Méthodes utilitaires ── */

/**
 * Dernier numéro de bloc.
 * @returns {Promise<number>}
 */
export async function getBlockNumber() {
  const hex = await rpcCall('eth_blockNumber', [])
  return parseInt(hex, 16)
}

/**
 * Balance ETH d'une adresse (en ETH, pas en wei).
 * @param {string} address
 * @returns {Promise<number>}
 */
export async function getBalance(address) {
  const hex = await rpcCall('eth_getBalance', [address, 'latest'])
  const wei = BigInt(hex)
  return Number(wei) / 1e18
}

/**
 * Nonce (= nombre de transactions émises) d'une adresse.
 * @param {string} address
 * @returns {Promise<number>}
 */
export async function getTxCount(address) {
  const hex = await rpcCall('eth_getTransactionCount', [address, 'latest'])
  return parseInt(hex, 16)
}

/**
 * Receipt d'une transaction (logs, gasUsed, status).
 * @param {string} txHash
 * @returns {Promise<object|null>}
 */
export async function getReceipt(txHash) {
  return rpcCall('eth_getTransactionReceipt', [txHash])
}

/**
 * Récupère les receipts de plusieurs transactions en batch.
 * Chunk en groupes de 20 pour ne pas surcharger le node.
 *
 * @param {string[]} txHashes
 * @returns {Promise<(object|null)[]>}
 */
export async function getReceiptsBatch(txHashes) {
  const CHUNK = 20
  const results = []

  for (let i = 0; i < txHashes.length; i += CHUNK) {
    const chunk = txHashes.slice(i, i + CHUNK)
    const calls = chunk.map((h) => ({
      method: 'eth_getTransactionReceipt',
      params: [h],
    }))
    const batch = await rpcBatch(calls)
    results.push(...batch)

    // Petite pause entre les chunks
    if (i + CHUNK < txHashes.length) {
      await new Promise((r) => setTimeout(r, 80))
    }
  }

  return results
}

/**
 * Récupère les logs d'un bloc ou d'une plage de blocs.
 * Utile pour détecter les events Swap des DEX.
 *
 * @param {object} filter - { address?, topics?, fromBlock?, toBlock? }
 * @returns {Promise<object[]>}
 */
export async function getLogs(filter) {
  return rpcCall('eth_getLogs', [filter])
}

/**
 * Signature des événements Swap des principaux DEX (Uniswap V2/V3, style).
 * Utilisée pour filtrer les logs et détecter les swaps.
 */
export const SWAP_TOPICS = {
  // Uniswap V2 style : Swap(address,uint256,uint256,uint256,uint256,address)
  UNISWAP_V2: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
  // Uniswap V3 style : Swap(address,address,int256,int256,uint160,uint128,int24)
  UNISWAP_V3: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
}

/**
 * Détecte si un receipt contient un événement Swap.
 * @param {object} receipt - receipt brut RPC
 * @returns {{ isSwap: boolean, protocol: string|null }}
 */
export function detectSwapInReceipt(receipt) {
  if (!receipt?.logs?.length) return { isSwap: false, protocol: null }

  for (const log of receipt.logs) {
    const topic0 = log.topics?.[0]?.toLowerCase()

    if (topic0 === SWAP_TOPICS.UNISWAP_V2.toLowerCase()) {
      return { isSwap: true, protocol: 'Uniswap V2' }
    }
    if (topic0 === SWAP_TOPICS.UNISWAP_V3.toLowerCase()) {
      return { isSwap: true, protocol: 'Uniswap V3' }
    }
  }

  return { isSwap: false, protocol: null }
}
