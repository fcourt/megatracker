import { useState } from 'react'

const PLACEHOLDER = `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B
0x742d35Cc6634C0532925a3b844Bc454e4438f44e`

const EXAMPLE_WALLETS = [
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
]

function isValidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim())
}

function parseAddresses(raw) {
  return raw
    .split(/[\n,;]+/)
    .map((a) => a.trim())
    .filter(Boolean)
}

export default function WalletInput({ onAnalyze, loading }) {
  const [raw, setRaw] = useState('')
  const [validationError, setValidationError] = useState(null)

  const addresses = parseAddresses(raw)
  const validAddresses = addresses.filter(isValidAddress)
  const invalidAddresses = addresses.filter((a) => !isValidAddress(a))
  const hasContent = addresses.length > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    if (invalidAddresses.length > 0) {
      setValidationError(
        `${invalidAddresses.length} adresse(s) invalide(s) : ${invalidAddresses.slice(0, 3).join(', ')}${invalidAddresses.length > 3 ? '…' : ''}`
      )
      return
    }
    if (validAddresses.length === 0) {
      setValidationError('Entrez au moins une adresse Ethereum valide.')
      return
    }
    if (validAddresses.length > 10) {
      setValidationError('Maximum 10 adresses par analyse.')
      return
    }
    setValidationError(null)
    onAnalyze(validAddresses.map(a => a.toLowerCase()))
  }

  const loadExample = () => {
    setRaw(EXAMPLE_WALLETS.join('\n'))
    setValidationError(null)
  }

  return (
    <div style={{
      maxWidth: '680px',
      margin: '0 auto',
      paddingTop: 'var(--space-8)',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          background: 'var(--accent)',
          border: '1px solid var(--border)',
          borderRadius: '9999px',
          padding: '4px var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--primary)',
            display: 'inline-block',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--foreground)',
            fontWeight: 600,
          }}>
            RÉSEAU MEGAETH · EN LIGNE
          </span>
        </div>

        <h1 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 700,
          color: 'var(--foreground)',
          fontFamily: 'var(--font-mono)',
          marginBottom: 'var(--space-3)',
        }}>
          Analyse d'activité wallet
        </h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-mono)',
          maxWidth: '48ch',
          margin: '0 auto',
          lineHeight: 1.7,
        }}>
          Entrez une ou plusieurs adresses pour visualiser les transactions,
          les swaps, les contrats interagis et les statistiques d'activité sur MegaETH.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 'var(--space-6)' }}>

          {/* Input label + compteur */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-2)',
          }}>
            <label className="label" htmlFor="wallet-input">
              Adresses wallet (une par ligne)
            </label>
            {hasContent && (
              <span style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: invalidAddresses.length > 0
                  ? 'var(--destructive)'
                  : 'var(--primary)',
              }}>
                {validAddresses.length} valide{validAddresses.length > 1 ? 's' : ''}
                {invalidAddresses.length > 0 && ` · ${invalidAddresses.length} invalide(s)`}
              </span>
            )}
          </div>

          {/* Textarea */}
          <textarea
            id="wallet-input"
            className="input"
            rows={5}
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setValidationError(null) }}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            autoComplete="off"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
          />

          {/* Chips des adresses valides */}
          {validAddresses.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-3)',
            }}>
              {validAddresses.map((addr) => (
                <div key={addr} className="address-chip">
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'inline-block',
                    flexShrink: 0,
                  }} />
                  {addr.slice(0, 6)}…{addr.slice(-4)}
                </div>
              ))}
            </div>
          )}

          {/* Validation error */}
          {validationError && (
            <div className="error-banner" style={{ marginTop: 'var(--space-3)' }}>
              {validationError}
            </div>
          )}

          {/* Actions */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-4)',
            flexWrap: 'wrap',
          }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !hasContent}
              style={{
                flex: 1,
                justifyContent: 'center',
                opacity: loading || !hasContent ? 0.6 : 1,
                cursor: loading || !hasContent ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <Spinner /> Analyse en cours…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  Analyser {validAddresses.length > 0 ? `(${validAddresses.length})` : ''}
                </>
              )}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={loadExample}
              disabled={loading}
              style={{ flexShrink: 0 }}
            >
              Exemple
            </button>

            {hasContent && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setRaw(''); setValidationError(null) }}
                disabled={loading}
                style={{ flexShrink: 0 }}
              >
                Effacer
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Légende */}
      <div style={{
        marginTop: 'var(--space-6)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))',
        gap: 'var(--space-3)',
      }}>
        {[
          { icon: '⚡', label: 'Transactions', desc: 'Historique complet' },
          { icon: '🔄', label: 'Swaps', desc: 'Volume & protocoles' },
          { icon: '📋', label: 'Contrats', desc: 'Interactions uniques' },
          { icon: '📈', label: 'Graphiques', desc: 'Séries temporelles' },
        ].map(({ icon, label, desc }) => (
          <div key={label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'calc(var(--radius) + 4px)',
          }}>
            <span style={{ fontSize: '1.25rem' }}>{icon}</span>
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--foreground)',
              }}>{label}</div>
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-mono)',
              }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Animation pulse pour le point réseau */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}
