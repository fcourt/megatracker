import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'

export default function SwapChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-12) var(--space-4)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" />
          <rect x="7" y="10" width="3" height="8" rx="1" />
          <rect x="13" y="6" width="3" height="12" rx="1" />
        </svg>
        <p style={{ fontSize: 'var(--text-sm)' }}>Aucun swap détecté</p>
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => d.volumeUsd ?? 0))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />

        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickFormatter={(d) => formatDateShort(d)}
          interval="preserveStartEnd"
        />

        <YAxis
          tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatUSDShort(v)}
          width={48}
        />

        <Tooltip content={<SwapTooltip />} />

        <Bar
          dataKey="volumeUsd"
          name="Volume USD"
          radius={[2, 2, 0, 0]}
          maxBarSize={40}
          animationDuration={700}
          animationEasing="ease-out"
        >
          {data.map((entry, i) => {
            const intensity = maxVal > 0 ? (entry.volumeUsd ?? 0) / maxVal : 0
            return (
              <Cell
                key={i}
                fill={intensity > 0.66
                  ? 'var(--chart-1)'
                  : intensity > 0.33
                  ? 'var(--chart-2)'
                  : 'var(--chart-3)'}
              />
            )
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function SwapTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload

  return (
    <div style={{
      background: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: 'calc(var(--radius) + 4px)',
      padding: 'var(--space-3) var(--space-4)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      boxShadow: '0 4px 16px var(--shadow-color)',
      minWidth: '160px',
    }}>
      <p style={{
        color: 'var(--muted-foreground)',
        marginBottom: 'var(--space-2)',
        fontWeight: 600,
      }}>
        {label}
      </p>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        color: 'var(--chart-1)',
        fontWeight: 700,
      }}>
        <span>Volume</span>
        <span>{formatUSDFull(d?.volumeUsd)}</span>
      </div>
      {d?.swapCount != null && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          color: 'var(--muted-foreground)',
          marginTop: 'var(--space-1)',
        }}>
          <span>Swaps</span>
          <span>{d.swapCount}</span>
        </div>
      )}
    </div>
  )
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function formatUSDShort(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function formatUSDFull(v) {
  if (v == null) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${Number(v).toFixed(2)}`
}
