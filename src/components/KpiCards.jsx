import { useEffect, useRef } from 'react'

const CARDS = [
  {
    key: 'totalTx',
    label: 'Transactions totales',
    icon: '⚡',
    format: (v) => formatNumber(v),
    color: 'var(--chart-1)',
  },
  {
    key: 'totalSwaps',
    label: 'Swaps détectés',
    icon: '🔄',
    format: (v) => formatNumber(v),
    color: 'var(--chart-2)',
  },
  {
    key: 'totalSwapVolumeUsd',
    label: 'Volume swaps (USD)',
    icon: '💰',
    format: (v) => formatUSD(v),
    color: 'var(--chart-1)',
  },
  {
    key: 'uniqueContracts',
    label: 'Contrats uniques',
    icon: '📋',
    format: (v) => formatNumber(v),
    color: 'var(--chart-3)',
  },
  {
    key: 'activeDays',
    label: 'Jours actifs',
    icon: '📅',
    format: (v) => `${v ?? 0}j`,
    color: 'var(--chart-2)',
  },
  {
    key: 'successRate',
    label: 'Taux de succès',
    icon: '✅',
    format: (v) => `${v ?? 0}%`,
    color: 'var(--chart-3)',
  },
  {
    key: 'totalGasUsed',
    label: 'Gas total consommé',
    icon: '⛽',
    format: (v) => formatGas(v),
    color: 'var(--chart-4)',
  },
  {
    key: 'uniqueProtocols',
    label: 'Protocoles uniques',
    icon: '🏛',
    format: (v) => formatNumber(v),
    color: 'var(--chart-4)',
  },
]

export default function KpiCards({ stats }) {
  return (
    <div className="grid-kpi">
      {CARDS.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          icon={card.icon}
          value={stats?.[card.key]}
          format={card.format}
          accentColor={card.color}
        />
      ))}
    </div>
  )
}

function KpiCard({ label, icon, value, format, accentColor }) {
  const valueRef = useRef(null)
  const prevValue = useRef(null)

  // Anime le chiffre quand la valeur change
  useEffect(() => {
    const el = valueRef.current
    if (!el) return
    if (prevValue.current === value) return
    prevValue.current = value

    // Flash animation sur changement
    el.style.transition = 'none'
    el.style.opacity = '0'
    el.style.transform = 'translateY(6px)'

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1)'
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      })
    })
  }, [value])

  const displayValue = value != null ? format(value) : '—'
  const isEmpty = value == null || value === 0

  return (
    <div
      className="card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderTop: `2px solid ${accentColor}`,
      }}
    >
      {/* Accent glow subtil */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: `linear-gradient(180deg, color-mix(in srgb, ${accentColor} 6%, transparent) 0%, transparent 100%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-3)',
        position: 'relative',
      }}>
        <span className="card-title">{label}</span>
        <span style={{
          fontSize: '1.1rem',
          lineHeight: 1,
          opacity: isEmpty ? 0.3 : 1,
          transition: 'opacity 0.3s ease',
        }}>
          {icon}
        </span>
      </div>

      {/* Valeur */}
      <div
        ref={valueRef}
        className="kpi-value"
        style={{
          color: isEmpty ? 'var(--muted-foreground)' : 'var(--foreground)',
        }}
      >
        {displayValue}
      </div>
    </div>
  )
}

/* ── Formatters ── */

function formatNumber(v) {
  if (v == null || isNaN(v)) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function formatUSD(v) {
  if (v == null || isNaN(v)) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${Number(v).toFixed(2)}`
}

function formatGas(v) {
  if (v == null || isNaN(v)) return '—'
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}G`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}
