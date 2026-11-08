import { useEffect, useState, type FormEvent } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { enabledProviders, supabase } from './supabase'

// Sign in with Google (no email needed) or by email. The email holds both a link and a code:
// the link works in a browser, the code is for the home-screen app (on iPhone it can't receive
// links opened in Safari). Supabase's built-in email sender allows only a few emails per hour,
// so this screen avoids spending them: a resend countdown, and entering a code you already have.

const EMAIL_KEY = 'espresso-log:last-email'
const RESEND_SECONDS = 60

function readSavedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_KEY, email)
  } catch {
    // storage blocked (private mode): remembering the email is only a convenience
  }
}

// After a failed Google sign-in, Supabase sends us back with ?error_description=... (or in the hash)
function readRedirectError(): string | null {
  const params = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#/, ''))
  const description = params.get('error_description')
  if (!description) return null
  if (/signups not allowed|not allowed/i.test(description))
    return 'That Google account doesn’t have access. Sign in with the Google account that uses the same email as before.'
  return `Google sign-in didn’t finish: ${description.replace(/\+/g, ' ')}`
}

export default function Login() {
  const [email, setEmail] = useState(readSavedEmail)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(readRedirectError)
  const [googleOn, setGoogleOn] = useState(false)
  // Resend countdown: no new email until this time (ms)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Drop ?error=... from the address bar so a refresh doesn't show it again
    if (window.location.search || window.location.hash.includes('error'))
      window.history.replaceState(null, '', window.location.pathname)
    enabledProviders().then((p) => setGoogleOn(!!p.google))
  }, [])

  const cooling = cooldownUntil > now
  useEffect(() => {
    if (!cooling) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [cooling])
  const secondsLeft = Math.ceil((cooldownUntil - now) / 1000)

  function startCooldown(seconds: number) {
    const t = Date.now()
    setNow(t)
    setCooldownUntil(t + seconds * 1000)
  }

  async function google() {
    setBusy(true)
    setError(null)
    // Leaves the page for Google; Supabase brings us back here signed in (App picks up the session)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setBusy(false)
      setError(error.message)
    }
  }

  async function send(): Promise<'sent' | 'limited' | 'failed'> {
    setBusy(true)
    setError(null)
    const address = email.trim()
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) {
      setError(sendError(error))
      if (!isRateLimit(error)) return 'failed'
      // Rate limited: honour the wait Supabase gives, and let them enter a code they already have
      const secs = Number(error.message.match(/after (\d+) seconds?/)?.[1])
      if (secs) startCooldown(secs)
      return 'limited'
    }
    saveEmail(address)
    startCooldown(RESEND_SECONDS)
    return 'sent'
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault()
    if ((await send()) !== 'failed') setStep('code')
  }

  // "I already have a code": go straight to the code field without sending another email
  function haveCode() {
    setError(null)
    setStep('code')
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const address = email.trim()
    // On success, App's onAuthStateChange picks up the new session and leaves this screen
    const { error } = await supabase.auth.verifyOtp({ email: address, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(codeError(error))
    else saveEmail(address)
  }

  function changeEmail() {
    setStep('email')
    setCode('')
    setError(null)
  }

  const emailValid = /\S+@\S+\.\S+/.test(email.trim())

  return (
    <div className="app center">
      <div className="hero">
        <h1>Espresso Log</h1>
        <p className="muted">Every shot, shared.</p>
      </div>
      <div className="card">
        {step === 'email' ? (
          <div className="stack">
            {googleOn && (
              <>
                <button type="button" className="btn btn-google" disabled={busy} onClick={google}>
                  <GoogleMark />
                  Continue with Google
                </button>
                <p className="or">or sign in with an email code</p>
              </>
            )}
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
              <button className="btn btn-primary" disabled={busy || cooling}>
                {busy ? 'Sending…' : cooling ? `Email sent. Send again in ${secondsLeft}s` : 'Email me a sign-in code'}
              </button>
              <button type="button" className="link" disabled={!emailValid} onClick={haveCode}>
                I already have a code
              </button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <form className="stack" onSubmit={submitCode}>
            <p>
              Enter the code from the latest sign-in email sent to <strong>{email.trim()}</strong>, or tap the link in
              that email.
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
              <button type="button" className="link" disabled={busy || cooling} onClick={() => send()}>
                {cooling ? `Send a new code in ${secondsLeft}s` : 'Send a new code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// Google's "G" mark (required next to "Continue with Google" by Google's branding rules)
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

const isRateLimit = (e: AuthError) => e.code === 'over_email_send_rate_limit' || e.status === 429

function sendError(e: AuthError): string {
  // When sign-ups are turned off in Supabase, unknown emails are refused
  if (e.code === 'otp_disabled' || e.code === 'signup_disabled' || /signups not allowed/i.test(e.message))
    return 'This email doesn’t have an account. Use the email you first signed in with, or ask whoever runs your log to add you.'
  if (isRateLimit(e)) {
    // Per-address cooldown: "...you can only request this after 42 seconds."
    if (/after \d+ seconds?/.test(e.message))
      return 'A code was just sent to this address. Check your inbox and spam, and enter it below.'
    // Project-wide hourly cap (Supabase's built-in email sender allows only a few per hour)
    return 'The sign-in email limit for this hour has been reached. Enter a code from an email you already received, or try again later.'
  }
  return e.message
}

function codeError(e: AuthError): string {
  if (e.code === 'otp_expired' || /expired|invalid/i.test(e.message))
    return 'That code is wrong or has expired. Check the latest email, or send a new code.'
  if (e.status === 429) return 'Too many attempts. Wait a minute, then try again.'
  return e.message
}
