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

// GET /api/admin/manipulation/assets
export async function GET(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Get OTC assets
  const { data: assets, error } = await supabase
    .from('otc_assets')
    .select('id, symbol, name, status, base_price, volatility, decimals')
    .eq('status', 'ACTIVE')
    .order('symbol')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get active forces from app_config directly
  const { data: cfgRow } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'asset_forces')
    .single()

  const activeForces = (cfgRow?.value ?? {}) as Record<string, any>

  const result = (assets ?? []).map((a: any) => {
    const force = activeForces[a.symbol]
    const isExpired = force && new Date(force.expires_at) < new Date()
    return {
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      category: a.symbol?.includes('BTC') || a.symbol?.includes('ETH') || a.symbol?.includes('LTC') ? 'CRYPTO' : 'CURRENCY',
      active_force: force && !isExpired ? {
        direction: force.direction,
        strength: force.strength,
        expires_at: force.expires_at,
      } : null,
    }
  })

  return NextResponse.json({ assets: result })
}

// POST /api/admin/manipulation/assets
// body: { symbol: string, direction: 'buy' | 'sell', strength: number, duration_seconds: number }
export async function POST(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { symbol, direction, strength, duration_seconds } = body

  if (!symbol || !['buy', 'sell'].includes(direction) || !strength || !duration_seconds) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Get current forces from app_config directly
  const { data: cfgRow } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'asset_forces')
    .single()

  const activeForces = (cfgRow?.value ?? {}) as Record<string, any>

  // Add/update force for this symbol
  activeForces[symbol] = {
    direction,
    strength,
    expires_at: new Date(Date.now() + duration_seconds * 1000).toISOString(),
  }

  // Upsert directly into app_config
  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key: 'asset_forces', value: activeForces, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, force: activeForces[symbol] })
}
