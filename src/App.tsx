import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Membership } from './types'
import Login from './Login'
import HouseholdSetup from './HouseholdSetup'
import ShotLog from './ShotLog'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  // undefined = not loaded yet, null = signed in but not in a household
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession((prev) => {
        if (prev?.user.id !== s?.user.id) setMembership(undefined) // different user: reload membership
        return s
      })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const loadMembership = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('household_members')
      .select('household_id, display_name, households(name, invite_code)')
      .eq('user_id', userId)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (error) setError(error.message)
    setMembership((data as Membership | null) ?? null)
  }, [userId])

  useEffect(() => {
    loadMembership()
  }, [loadMembership])

  if (!authReady) return null
  if (!session) return <Login />

  return (
    <div className="app">
      <header className="header">
        <span className="wordmark">Espresso Log</span>
        <AccountMenu email={session.user.email ?? ''} membership={membership ?? null} />
      </header>
      {error && <p className="error">{error}</p>}
      {membership === null && <HouseholdSetup onDone={loadMembership} />}
      {membership && <ShotLog householdId={membership.household_id} userId={session.user.id} />}
    </div>
  )
}

function AccountMenu({ email, membership }: { email: string; membership: Membership | null }) {
  const [copied, setCopied] = useState(false)

  async function copy(code: string) {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <details className="menu">
      <summary>
        {membership ? membership.households.name : 'Account'} <span aria-hidden>▾</span>
      </summary>
      <div className="menu-panel">
        {membership && (
          <div>
            <p className="muted small">Invite someone to {membership.households.name} with this code</p>
            <div className="invite">
              <span className="invite-code">{membership.households.invite_code}</span>
              <button className="link" onClick={() => copy(membership.households.invite_code)}>
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
          </div>
        )}
        <div className="row">
          <span className="small grow">
            {membership && <strong style={{ display: 'block' }}>{membership.display_name}</strong>}
            <span className="muted">{email}</span>
          </span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </details>
  )
}
