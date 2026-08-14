import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function verifyAdmin(req: NextRequest) {
  const adminClient = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: () => {},
    },
  })
  const { data: { user }, error } = await adminClient.auth.getUser()
  if (error || !user) return null
  const { data: isAdmin } = await adminClient.rpc('is_admin', { uid: user.id })
  if (!isAdmin) return null
  return user
}

// Keys stored in app_config
const CONFIG_KEYS = [
  'manipulation_enabled',
  'manipulation_mode',
  'house_win_pct',
  'volume_manipulation_enabled',
  'volume_manipulation_strength',
]

const DEFAULTS: Record<string, any> = {
  manipulation_enabled: false,
  manipulation_mode: 'all',
  house_win_pct: 55,
  volume_manipulation_enabled: false,
  volume_manipulation_strength: 1,
}

// GET /api/admin/manipulation/settings
export async function GET(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', CONFIG_KEYS)

  if (error) {
    console.error('Error loading manipulation settings:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const cfg: Record<string, any> = {}
  for (const row of (data ?? [])) {
    cfg[row.key] = row.value
  }

  const result: Record<string, any> = {}
  for (const key of CONFIG_KEYS) {
    result[key] = cfg[key] ?? DEFAULTS[key]
  }

  return NextResponse.json(result)
}

// POST /api/admin/manipulation/settings
export async function POST(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  for (const key of CONFIG_KEYS) {
    if (body[key] !== undefined) {
      const { error } = await supabase
        .from('app_config')
        .upsert(
          { key, value: body[key], updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
      if (error) {
        console.error(`Error setting ${key}:`, error)
        return NextResponse.json({ error: `Failed to save ${key}: ${error.message}` }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ success: true })
}
