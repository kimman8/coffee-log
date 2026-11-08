import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill them in.',
  )
}

export const supabase = createClient(url, key)

// Which sign-in providers are switched on in Supabase (public endpoint, publishable key only).
// Used to show "Continue with Google" only once Google is enabled, instead of a broken button.
export async function enabledProviders(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    if (!res.ok) return {}
    const body = (await res.json()) as { external?: Record<string, boolean> }
    return body.external ?? {}
  } catch {
    return {}
  }
}
