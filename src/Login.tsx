import { useState, type FormEvent } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Sign in by email. The email holds both a link and a code: the link works in a browser,
// the code is for the home-screen app (on iPhone it can't receive links opened in Safari).
export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  async function send() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) {
      setError(sendError(error))
      return false
    }
    return true
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault()
    if (await send()) setStep('code')
  }

  async function resend() {
    setResent(false)
    if (await send()) setResent(true)
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // On success, App's onAuthStateChange picks up the new session and leaves this screen
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(codeError(error))
  }

  function changeEmail() {
    setStep('email')
    setCode('')
    setError(null)
    setResent(false)
  }

  return (
    <div className="app center">
      <div className="hero">
        <h1>Espresso Log</h1>
        <p className="muted">Every shot, shared.</p>
      </div>
      <div className="card">
        {step === 'email' ? (
          <form className="stack" onSubmit={submitEmail}>
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
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
        ) : (
          <form className="stack" onSubmit={submitCode}>
            <p>
              We sent a code to <strong>{email.trim()}</strong>. Enter it here, or tap the link in the email.
            </p>
            <label>
              <span className="label">Sign-in code</span>
              <input
                className="input code-input"
                autoFocus
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <button className="btn btn-primary" disabled={busy || code.length < 6}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="link" onClick={changeEmail}>
                Use a different email
              </button>
              <button type="button" className="link" disabled={busy} onClick={resend}>
                {resent ? 'Code sent again' : 'Send a new code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function sendError(e: AuthError): string {
  // When sign-ups are turned off in Supabase, unknown emails are refused
  if (e.code === 'otp_disabled' || e.code === 'signup_disabled' || /signups not allowed/i.test(e.message))
    return 'This email doesn’t have an account. Use the email you first signed in with, or ask whoever runs your log to add you.'
  if (e.code === 'over_email_send_rate_limit' || e.status === 429)
    return 'Too many emails sent. Wait a minute, then try again.'
  return e.message
}

function codeError(e: AuthError): string {
  if (e.code === 'otp_expired' || /expired|invalid/i.test(e.message))
    return 'That code is wrong or has expired. Check the latest email, or send a new code.'
  if (e.status === 429) return 'Too many attempts. Wait a minute, then try again.'
  return e.message
}
