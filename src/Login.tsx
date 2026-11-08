import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setStatus('idle')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="app center">
      <div className="hero">
        <h1>Espresso Log</h1>
        <p className="muted">Every shot, shared.</p>
      </div>
      <div className="card">
        {status === 'sent' ? (
          <div className="stack" style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600 }}>Check your email</p>
            <p className="muted">
              We sent a sign-in link to <strong>{email}</strong>. Open it on this device.
            </p>
            <button className="link" onClick={() => setStatus('idle')}>
              Use a different email
            </button>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <label>
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
