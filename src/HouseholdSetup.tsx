import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'

export default function HouseholdSetup({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [displayName, setDisplayName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } =
      mode === 'create'
        ? await supabase.rpc('create_household', {
            p_name: householdName.trim(),
            p_display_name: displayName.trim(),
          })
        : await supabase.rpc('join_household', { p_code: code.trim(), p_display_name: displayName.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <div className="center" style={{ minHeight: '70vh' }}>
      <div className="hero">
        <h1>Set up your log</h1>
        <p className="muted">Start a new household, or join one with an invite code.</p>
      </div>
      <form className="card stack" onSubmit={submit}>
        <div className="segmented" role="group" aria-label="Create or join">
          <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
            Create
          </button>
          <button type="button" aria-pressed={mode === 'join'} onClick={() => setMode('join')}>
            Join
          </button>
        </div>

        <label>
          <span className="label">Your name</span>
          <input
            className="input"
            required
            autoComplete="given-name"
            placeholder="Shown on your shots"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>

        {mode === 'create' ? (
          <label>
            <span className="label">Household name</span>
            <input
              className="input"
              required
              placeholder="e.g. Home"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
          </label>
        ) : (
          <label>
            <span className="label">Invite code</span>
            <input
              className="input"
              required
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="12-character code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'One moment…' : mode === 'create' ? 'Create household' : 'Join household'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
