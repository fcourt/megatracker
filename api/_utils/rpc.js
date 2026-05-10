/**
 * Client JSON-RPC MegaETH
 * Endpoint public : https://carrot.megaeth.com/rpc
 * Chain ID : 4326
 */

const RPC_URL = 'https://carrot.megaeth.com/rpc'

let _reqId = 1

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

  if (!res.ok) throw new Error(`RPC HTTP ${res.status} sur ${method}`)

  const json = await res.json()
  if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)

  return json.result
}

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

  if (!res.ok) throw new Error(`RPC batch HTTP ${res.status}`)

  const results = await res.json()
  const sorted = [...results].sort((a, b) => a.id - b.id)
  return sorted.map((r) => {
    if (r.error) { console.warn(`RPC batch error: ${r.error.message}`); return null }
    return r.result
  })
}

export async function getBlockNumber() {
  const hex = await rpcCall('eth_blockNumber', [])
  return parseInt(hex, 16)
}

export async function getBalance(address) {
  const hex = await rpcCall('eth_getBalance', [address, 'latest'])
  return Number(BigInt(hex)) / 1e18
}

export async function getTxCount(address) {
  const hex = await rpcCall('eth_getTransactionCount', [address, 'latest'])
  return parseInt(hex, 16)
}

export async function getReceipt(txHash) {
  return rpcCall('eth_getTransactionReceipt', [txHash])
}

export async function getReceiptsBatch(txHashes) {
  const CHUNK = 20
  const results = []
  for (let i = 0; i < txHashes.length; i += CHUNK) {
    const chunk = txHashes.slice(i, i + CHUNK)
    const calls = chunk.map((h) => ({ method: 'eth_getTransactionReceipt', params: [h] }))
    const batch = await rpcBatch(calls)
    results.push(...batch)
    if (i + CHUNK < txHashes.length) await new Promise((r) => setTimeout(r, 80))
  }
  return results
}

export async function getLogs(filter) {
  return rpcCall('eth_getLogs', [filter])
}

/* ──────────────────────────────────────────────────────────────
   TOPICS & ADRESSES DES DEX SUR MEGAETH
   ────────────────────────────────────────────────────────────── */

/**
 * Topics des événements Swap.
 * Ces topics sont UNIVERSELS — ils ne changent pas selon le réseau,
 * seules les adresses des contrats changent.
 */
export const SWAP_TOPICS = {
  // Uniswap V2 / forks : Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)
  UNISWAP_V2: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',

  // Uniswap V3 / forks : Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
  UNISWAP_V3: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
}

/**
 * Adresses des routeurs et contrats DEX déployés sur MegaETH (chain 4326).
 * Source : https://docs.uniswap.org/contracts/v3/reference/deployments/megaeth-deployments
 */
export const KNOWN_DEX_CONTRACTS = {
  // ── Uniswap V3 (officiel MegaETH) ──
  '0x48020de9208bafc183f5cad5118ffbe8f0f913f5': 'Uniswap V3',   // SwapRouter02
  '0x2eec3eb1c9dc14af773e04a177f960124295a067': 'Uniswap V3',   // SwapRouter
  '0x47837eb80db5908eabba9105626d9b348bea7b02': 'Uniswap V3',   // UniversalRouter
  '0x3a5f0cd7d62452b7f899b2a5758bfa57be0de478': 'Uniswap V3',   // Factory

  // ── WETH MegaETH ──
  '0x4200000000000000000000000000000000000006': 'WETH',

  // ── DEX natifs MegaETH (adresses à compléter quand publiées) ──
  // Kumbaya DEX — DEX spot natif MegaETH
  // GTE — spot + perps CLOB
  // Ces adresses seront ajoutées dès leur publication officielle
}

/**
 * Détermine le protocole d'un swap à partir du `to` d'une transaction
 * ou des adresses dans les logs.
 *
 * @param {object} receipt   - receipt brut RPC
 * @param {string} [txTo]    - adresse de destination de la tx (contractAddress normalisé)
 * @returns {{ isSwap: boolean, protocol: string|null }}
 */
export function detectSwapInReceipt(receipt, txTo = null) {
  if (!receipt?.logs?.length) return { isSwap: false, protocol: null }

  // 1. Cherche un topic Swap dans les logs
  let foundTopic = null
  let foundLogAddress = null

  for (const log of receipt.logs) {
    const topic0 = log.topics?.[0]?.toLowerCase()

    if (topic0 === SWAP_TOPICS.UNISWAP_V2) {
      foundTopic = 'v2'
      foundLogAddress = log.address?.toLowerCase()
      break
    }
    if (topic0 === SWAP_TOPICS.UNISWAP_V3) {
      foundTopic = 'v3'
      foundLogAddress = log.address?.toLowerCase()
      break
    }
  }

  if (!foundTopic) return { isSwap: false, protocol: null }

  // 2. Identifie le protocole
  // Priorité : adresse du routeur (txTo) > adresse du pool (log)
  const routerAddr = txTo?.toLowerCase()
  const protocol =
    KNOWN_DEX_CONTRACTS[routerAddr] ??
    KNOWN_DEX_CONTRACTS[foundLogAddress] ??
    (foundTopic === 'v3' ? 'Uniswap V3' : 'Uniswap V2')

  return { isSwap: true, protocol }
}
