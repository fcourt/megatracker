import { useState } from 'react'
import KpiCards from './KpiCards.jsx'
import TxChart from './TxChart.jsx'
import SwapChart from './SwapChart.jsx'
import ContractsTable from './ContractsTable.jsx'

export default function WalletTabs({ wallets, perWallet }) {
  const [active, setActive] = useState(wallets[0]?.toLowerCase() ?? '')

  if (!wallets.length) {
    return (
      <div className="empty-state">
        <p>Aucun wallet à afficher.</p>
      </div>
    )
  }

  const walletData = perWallet?.[active] ?? perWallet?.[active.toLowerCase()]

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
        {wallets.map((addr) => (
          <button
            key={addr}
            className={`tab${active === addr ? ' active' : ''}`}
            onClick={() => setActive(addr.toLowerCase())}
            title={addr}
          >
            {shortAddr(addr)}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        marginBottom: 'var(--space-6)', flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: 'var(--muted-foreground)', wordBreak: 'break-all',
        }}>
          {active}
        </span>
        <a
          href={`https://megaeth.blockscout.com/address/${active}`}
          target="_blank" rel="noopener noreferrer"
          className="badge badge-primary"
          style={{ textDecoration: 'none', flexShrink: 0 }}
        >
          Explorer ↗
        </a>
      </div>

      {!walletData ? (
        <div className="empty-state">
          <p style={{ fontSize: 'var(--text-sm)' }}>Aucune donnée pour cette adresse.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

          {/* ✅ walletData directement, pas walletData.stats */}
          <KpiCards stats={walletData.stats} />

          <div className="grid-charts">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Transactions par jour</h2>
              </div>
              <TxChart data={walletData.txTimeSeries} />
            </div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Volume de swaps (USD)</h2>
              </div>
              <SwapChart data={walletData.swapTimeSeries} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="card-title">Contrats interagis</h2>
                <span className="badge">{walletData.contracts?.length ?? 0} uniques</span>
              </div>
            </div>
            <ContractsTable contracts={walletData.contracts ?? []} />
          </div>

          <div className="grid-kpi">
            {/* ✅ walletData.xxx directement, pas walletData.stats.xxx */}
            <InfoCard label="Première transaction" value={walletData.stats?.firstTxDate ?? '—'} />
            <InfoCard label="Dernière transaction"  value={walletData.stats?.lastTxDate ?? '—'} />
            <InfoCard label="Jours actifs"          value={walletData.stats?.activeDays ?? '—'} />
            <InfoCard
              label="Taux de succès"
              value={walletData.stats?.successRate != null ? `${walletData.stats.successRate}%` : '—'}
            />
          </div>

        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value }) {
  return (
    <div className="card" style={{ borderTop: '2px solid var(--border)' }}>
      <div className="card-title" style={{ marginBottom: 'var(--space-2)' }}>{label}</div>
      <div className="kpi-value" style={{ fontSize: 'var(--text-lg)', color: 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  )
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr ?? '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
