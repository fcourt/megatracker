import { useState } from 'react'
import KpiCards from './KpiCards.jsx'
import TxChart from './TxChart.jsx'
import SwapChart from './SwapChart.jsx'
import ContractsTable from './ContractsTable.jsx'
import WalletTabs from './WalletTabs.jsx'

const VIEWS = ['global', 'wallets', 'contrats', 'swaps']
const VIEW_LABELS = {
  global:   '📊 Vue globale',
  wallets:  '👛 Par wallet',
  contrats: '📋 Contrats',
  swaps:    '🔄 Swaps',
}

export default function Dashboard({ data, wallets }) {
  const [view, setView] = useState('global')

  const { global, perWallet } = data

  return (
    <div>
      {/* ── Tabs navigation ── */}
      <div className="tabs">
        {VIEWS.map((v) => (
          <button
            key={v}
            className={`tab${view === v ? ' active' : ''}`}
            onClick={() => setView(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {/* ── Vue globale ── */}
      {view === 'global' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

          <KpiCards stats={global} />

          <div className="grid-charts">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Transactions par jour</h2>
              </div>
              <TxChart data={global.txTimeSeries} />
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Volume de swaps (USD)</h2>
              </div>
              <SwapChart data={global.swapTimeSeries} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="card-title">Top contrats interagis</h2>
                <span className="badge">{global.contracts.length} uniques</span>
              </div>
            </div>
            <ContractsTable contracts={global.contracts.slice(0, 10)} />
          </div>

        </div>
      )}

      {/* ── Vue par wallet ── */}
      {view === 'wallets' && (
        <WalletTabs wallets={wallets} perWallet={perWallet} />
      )}

      {/* ── Vue contrats ── */}
      {view === 'contrats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* Stats rapides */}
          <div className="grid-kpi">
            <StatMini
              label="Contrats uniques"
              value={global.contracts.length}
            />
            <StatMini
              label="Contrat le + actif"
              value={global.contracts[0]
                ? shortAddr(global.contracts[0].address)
                : '—'}
              sub={global.contracts[0]
                ? `${global.contracts[0].txCount} txs`
                : ''}
            />
            <StatMini
              label="1ère interaction"
              value={global.firstTxDate ?? '—'}            />
            <StatMini
              label="Dernière interaction"
              value={global.lastTxDate ?? '—'}
            />
          </div>

          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="card-title">Tous les contrats interagis</h2>
                <span className="badge">{global.contracts.length} adresses</span>
              </div>
            </div>
            <ContractsTable contracts={global.contracts} showAll />
          </div>

        </div>
      )}

      {/* ── Vue swaps ── */}
      {view === 'swaps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

          {/* Stats swaps */}
          <div className="grid-kpi">
            <StatMini
              label="Swaps totaux"
              value={global.totalSwaps ?? 0}
            />
            <StatMini
              label="Volume total (USD)"
              value={formatUSD(global.totalSwapVolumeUsd)}
            />
            <StatMini
              label="Volume moyen / swap"
              value={global.totalSwaps ? formatUSD(global.totalSwapVolumeUsd / global.totalSwaps) : '—'}
            />
            <StatMini
              label="Protocoles uniques"
              value={global.uniqueProtocols ?? '—'}
            />
          </div>

          <div className="grid-charts">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Volume de swaps par jour (USD)</h2>
              </div>
              <SwapChart data={global.swapTimeSeries} />
            </div>

            {global.swapsByProtocol?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Swaps par protocole</h2>
                </div>
                <ProtocolBreakdown data={global.swapsByProtocol} />
              </div>
            )}
          </div>

          {/* Tableau des derniers swaps */}
          {global.recentSwaps?.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Derniers swaps détectés</h2>
              </div>
              <SwapsTable swaps={global.recentSwaps} />
            </div>
          )}

        </div>
      )}
    </div>
  )
}

/* ── Sous-composants inline légers ── */

function StatMini({ label, value, sub }) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 'var(--space-2)' }}>{label}</div>
      <div className="kpi-value" style={{ fontSize: 'var(--text-lg)' }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-mono)',
          marginTop: 'var(--space-1)',
        }}>{sub}</div>
      )}
    </div>
  )
}

function ProtocolBreakdown({ data }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {data.map((item, i) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
        return (
          <div key={item.protocol}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-1)',
            }}>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--foreground)',
                fontWeight: 600,
              }}>
                {item.protocol}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted-foreground)',
              }}>
                {item.count} swaps · {pct}%
              </span>
            </div>
            <div style={{
              height: 6,
              background: 'var(--muted)',
              borderRadius: '9999px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: COLORS[i % COLORS.length],
                borderRadius: '9999px',
                transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SwapsTable({ swaps }) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Wallet</th>
            <th>Token In</th>
            <th>Token Out</th>
            <th>Valeur (USD)</th>
            <th>Protocole</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {swaps.map((swap) => (
            <tr key={swap.txHash}>
              <td style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                {swap.date}
              </td>
              <td>
                <span className="address-chip">{shortAddr(swap.wallet)}</span>
              </td>
              <td style={{ color: 'var(--chart-3)', fontWeight: 600 }}>
                {swap.tokenIn}
              </td>
              <td style={{ color: 'var(--chart-1)', fontWeight: 600 }}>
                {swap.tokenOut}
              </td>
              <td style={{ fontWeight: 700 }}>
                {swap.valueUsd ? formatUSD(swap.valueUsd) : '—'}
              </td>
              <td>
                <span className="badge">{swap.protocol ?? 'Unknown'}</span>
              </td>
              <td>
                <a
                  href={`https://megaeth.blockscout.com/tx/${swap.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--primary)',
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    textDecoration: 'none',
                  }}
                >
                  {shortAddr(swap.txHash)} ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Utilitaires ── */

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr ?? '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatUSD(val) {
  if (val == null || isNaN(val)) return '—'
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
  return `$${Number(val).toFixed(2)}`
}
