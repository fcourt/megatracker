import { useState, useCallback } from 'react'
import WalletInput from './components/WalletInput.jsx'
import Dashboard from './components/Dashboard.jsx'

export default function App() {
  const [darkMode, setDarkMode] = useState(window.__themeIsDark)
  const [analysisData, setAnalysisData] = useState(null)
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const toggleTheme = () => {
    const next = !darkMode
    setDarkMode(next)
    window.__setTheme(next)
  }

  const handleAnalyze = useCallback(async (addresses) => {
    setLoading(true)
    setError(null)
    setAnalysisData(null)
    setWallets(addresses)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `Erreur serveur (${res.status})`)
      }

      const data = await res.json()
      setAnalysisData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <header style={{
        background: 'var(--sidebar)',
        borderBottom: '1px solid var(--border)',
        padding: '0 var(--space-4)',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="MegaETH Tracker">
            <rect width="28" height="28" rx="6" fill="var(--primary)" />
            <path d="M7 14 L14 7 L21 14 L14 21 Z" stroke="var(--primary-foreground)" strokeWidth="1.5" fill="none" />
            <circle cx="14" cy="14" r="3" fill="var(--primary-foreground)" />
          </svg>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 'var(--text-base)',
            color: 'var(--foreground)',
            letterSpacing: '0.04em',
          }}>
            MEGAETH<span style={{ color: 'var(--primary)', marginLeft: '2px' }}>TRACKER</span>
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <a
            href="https://megaeth.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
            }}
          >
            MegaETH ↗
          </a>

          {/* Theme toggle */}
          <button
            className="btn btn-ghost"
            onClick={toggleTheme}
            aria-label={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
            style={{ padding: 'var(--space-2)', fontSize: '1rem' }}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ flex: 1, padding: 'var(--space-8) var(--space-4)' }}>
        <div className="container">

          {/* Hero / Wallet Input */}
          {!analysisData && !loading && (
            <WalletInput onAnalyze={handleAnalyze} loading={loading} />
          )}

          {/* Error */}
          {error && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div className="error-banner">⚠ {error}</div>
              <button
                className="btn btn-secondary"
                style={{ marginTop: 'var(--space-4)' }}
                onClick={() => { setError(null); setAnalysisData(null) }}
              >
                ← Nouvelle recherche
              </button>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && <LoadingSkeleton />}

          {/* Dashboard */}
          {analysisData && !loading && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-6)',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
              }}>
                <div>
                  <h1 style={{
                    fontSize: 'var(--text-xl)',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    Analyse wallet{wallets.length > 1 ? 's' : ''}
                  </h1>
                  <p style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--muted-foreground)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 'var(--space-1)',
                  }}>
                    {wallets.length} adresse{wallets.length > 1 ? 's' : ''} · réseau MegaETH
                  </p>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setAnalysisData(null); setWallets([]) }}
                >
                  ← Nouvelle recherche
                </button>
              </div>

              <Dashboard data={analysisData} wallets={wallets} />
            </>
          )}

        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: 'var(--space-4)',
        textAlign: 'center',
        fontSize: 'var(--text-xs)',
        color: 'var(--muted-foreground)',
        fontFamily: 'var(--font-mono)',
      }}>
        MegaETH Tracker · données via Blockscout &amp; RPC MegaETH
      </footer>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="skeleton skeleton-heading" />
      <div className="grid-kpi">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card">
            <div className="skeleton skeleton-text" style={{ width: '60%' }} />
            <div className="skeleton" style={{ height: '2.5rem', marginTop: 'var(--space-2)' }} />
          </div>
        ))}
      </div>
      <div className="grid-charts">
        <div className="card">
          <div className="skeleton skeleton-block" />
        </div>
        <div className="card">
          <div className="skeleton skeleton-block" />
        </div>
      </div>
    </div>
  )
}
