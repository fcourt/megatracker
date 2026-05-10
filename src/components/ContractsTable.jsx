import { useState } from 'react'

const PAGE_SIZE = 20

export default function ContractsTable({ contracts = [], showAll = false }) {
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('txCount')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState('')

  if (contracts.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-12) var(--space-4)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
        <h3>Aucun contrat détecté</h3>
        <p style={{ fontSize: 'var(--text-sm)' }}>
          Les interactions avec des smart contracts apparaîtront ici.
        </p>
      </div>
    )
  }

  // Filtrage
  const filtered = contracts.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.address?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.protocol?.toLowerCase().includes(q)
    )
  })

  // Tri
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    if (typeof av === 'string') {
      return sortDir === 'asc'
        ? av.localeCompare(bv)
        : bv.localeCompare(av)
    }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = showAll ? sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : sorted

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(1)
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span style={{ opacity: 0.3 }}>↕</span>
    return <span style={{ color: 'var(--primary)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div>
      {/* Search — uniquement en mode showAll */}
      {showAll && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <input
            type="text"
            className="input"
            placeholder="Filtrer par adresse, nom ou protocole…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            style={{ maxWidth: '400px' }}
          />
        </div>
      )}

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>
                <button
                  onClick={() => handleSort('address')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'inherit', font: 'inherit', display: 'flex',
                    alignItems: 'center', gap: 4,
                  }}
                >
                  Adresse <SortIcon col="address" />
                </button>
              </th>
              <th>Nom / Label</th>
              <th>
                <button
                  onClick={() => handleSort('txCount')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'inherit', font: 'inherit', display: 'flex',
                    alignItems: 'center', gap: 4,
                  }}
                >
                  Txs <SortIcon col="txCount" />
                </button>
              </th>
              <th>
                <button
                  onClick={() => handleSort('firstSeen')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'inherit', font: 'inherit', display: 'flex',
                    alignItems: 'center', gap: 4,
                  }}
                >
                  1ère interaction <SortIcon col="firstSeen" />
                </button>
              </th>
              <th>
                <button
                  onClick={() => handleSort('lastSeen')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'inherit', font: 'inherit', display: 'flex',
                    alignItems: 'center', gap: 4,
                  }}
                >
                  Dernière <SortIcon col="lastSeen" />
                </button>
              </th>
              <th>Protocole</th>
              <th>Explorer</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((contract, i) => {
              const rank = showAll ? (page - 1) * PAGE_SIZE + i + 1 : i + 1
              const isTop = rank <= 3

              return (
                <tr key={contract.address}>
                  {/* Rang */}
                  <td style={{
                    color: isTop ? 'var(--primary)' : 'var(--muted-foreground)',
                    fontWeight: isTop ? 700 : 400,
                    textAlign: 'center',
                  }}>
                    {rank <= 3
                      ? ['🥇', '🥈', '🥉'][rank - 1]
                      : rank}
                  </td>

                  {/* Adresse */}
                  <td>
                    <span className="address-chip" title={contract.address}>
                      {shortAddr(contract.address)}
                    </span>
                  </td>

                  {/* Nom */}
                  <td style={{
                    color: contract.name ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontStyle: contract.name ? 'normal' : 'italic',
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {contract.name ?? 'Inconnu'}
                  </td>

                  {/* Tx count avec barre visuelle */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--foreground)', minWidth: 32 }}>
                        {contract.txCount}
                      </span>
                      <TxBar
                        value={contract.txCount}
                        max={contracts[0]?.txCount ?? 1}
                      />
                    </div>
                  </td>

                  {/* Dates */}
                  <td style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                    {contract.firstSeen ?? '—'}
                  </td>
                  <td style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                    {contract.lastSeen ?? '—'}
                  </td>

                  {/* Protocole */}
                  <td>
                    {contract.protocol
                      ? <span className="badge">{contract.protocol}</span>
                      : <span style={{ color: 'var(--muted-foreground)', fontSize: 'var(--text-xs)' }}>—</span>
                    }
                  </td>

                  {/* Lien explorer */}
                  <td>
                    <a
                      href={`https://megaeth.blockscout.com/address/${contract.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--primary)',
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                        textDecoration: 'none',
                      }}
                    >
                      ↗
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination — mode showAll uniquement */}
      {showAll && totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'var(--space-4)',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}>
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono)',
          }}>
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''} · page {page}/{totalPages}
          </span>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ padding: 'var(--space-1) var(--space-3)', opacity: page === 1 ? 0.4 : 1 }}
            >
              ← Précédent
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ padding: 'var(--space-1) var(--space-3)', opacity: page === totalPages ? 0.4 : 1 }}
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Barre de progression relative ── */
function TxBar({ value, max }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 80)) : 0
  return (
    <div style={{
      width: 80,
      height: 4,
      background: 'var(--muted)',
      borderRadius: '9999px',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: 'var(--chart-1)',
        borderRadius: '9999px',
      }} />
    </div>
  )
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr ?? '—'
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}
