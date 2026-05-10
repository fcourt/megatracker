import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export default function TxChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-12) var(--space-4)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
        <p style={{ fontSize: 'var(--text-sm)' }}>Aucune donnée de transaction</p>
      </div>
    )
  }

  // Détermine les séries disponibles (ex: "total", ou une clé par wallet)
  const seriesKeys = Object.keys(data[0]).filter((k) => k !== 'date')

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {seriesKeys.map((key, i) => (
            <linearGradient key={key} id={`grad-tx-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

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
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)}
          width={36}
        />

        <Tooltip content={<CustomTooltip unit="txs" />} />

        {seriesKeys.length > 1 && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)',
              paddingTop: '8px',
            }}
          />
        )}

        {seriesKeys.map((key, i) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={key === 'total' ? 'Transactions' : key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            fill={`url(#grad-tx-${i})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            animationDuration={700}
            animationEasing="ease-out"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function CustomTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null

  return (
    <div style={{
      background: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: 'calc(var(--radius) + 4px)',
      padding: 'var(--space-3) var(--space-4)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      boxShadow: '0 4px 16px var(--shadow-color)',
    }}>
      <p style={{
        color: 'var(--muted-foreground)',
        marginBottom: 'var(--space-2)',
        fontWeight: 600,
      }}>
        {label}
      </p>
      {payload.map((p) => (
        <div key={p.dataKey} style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--space-6)',
          color: p.stroke,
          fontWeight: 700,
        }}>
          <span>{p.name}</span>
          <span>{p.value} {unit}</span>
        </div>
      ))}
    </div>
  )
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}
