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

// POST /api/admin/manipulation/orders/force
// Applies directional force on the asset's chart to make the order win or lose.
// The OTC engine reads asset_forces from app_config and biases prices accordingly.
export async function POST(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { operation_id, result } = body

  if (!operation_id || !['WIN', 'LOSS'].includes(result)) {
    return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // 1. Get the operation details
  const { data: op, error: opErr } = await supabase
    .from('operations')
    .select('id, asset_id, asset_symbol, direction, entry_price, expires_at, status')
    .eq('id', operation_id)
    .eq('status', 'OPEN')
    .single()

  if (opErr || !op) {
    return NextResponse.json({ error: 'Ordem nao encontrada ou ja encerrada' }, { status: 404 })
  }

  // 2. Determine the force direction needed
  // If we want the order to WIN:
  //   CALL order wins when price goes UP  → force = 'buy'
  //   PUT  order wins when price goes DOWN → force = 'sell'
  // If we want the order to LOSS:
  //   CALL order loses when price goes DOWN → force = 'sell'
  //   PUT  order loses when price goes UP   → force = 'buy'
  let forceDirection: 'buy' | 'sell'
  if (result === 'WIN') {
    forceDirection = op.direction === 'CALL' ? 'buy' : 'sell'
  } else {
    forceDirection = op.direction === 'CALL' ? 'sell' : 'buy'
  }

  // 3. Calculate duration until order expires (+ small buffer)
  const expiresAt = new Date(op.expires_at)
  const now = new Date()
  const remainingMs = expiresAt.getTime() - now.getTime()
  
  if (remainingMs <= 0) {
    return NextResponse.json({ error: 'Ordem ja expirou' }, { status: 400 })
  }

  // Force duration = remaining time + 2 second buffer
  const durationSec = Math.ceil(remainingMs / 1000) + 2

  // 4. Resolve the OTC symbol for the engine
  // The engine uses symbols like 'EURJPY-OTC'
  // Operations can have asset_symbol as 'EUR/JPY (OTC)' or 'EURJPY-OTC'
  const engineSymbol = resolveEngineSymbol(op.asset_id, op.asset_symbol)

  // 5. Apply force via asset_forces in app_config
  const { data: cfgRow } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'asset_forces')
    .single()

  const activeForces = (cfgRow?.value ?? {}) as Record<string, any>

  // Use high strength (3x) for individual order forcing
  activeForces[engineSymbol] = {
    direction: forceDirection,
    strength: 3,
    expires_at: new Date(Date.now() + durationSec * 1000).toISOString(),
    reason: `force_${result.toLowerCase()}_order_${operation_id.slice(0,8)}`,
  }

  const { error: saveErr } = await supabase
    .from('app_config')
    .upsert(
      { key: 'asset_forces', value: activeForces, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (saveErr) {
    console.error('Error saving asset force:', saveErr)
    return NextResponse.json({ error: saveErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Forca ${forceDirection.toUpperCase()} aplicada em ${engineSymbol} por ${durationSec}s para ${result} a ordem`,
    force: {
      symbol: engineSymbol,
      direction: forceDirection,
      strength: 3,
      duration_seconds: durationSec,
    }
  })
}

// Resolve asset_symbol to OTC engine format: 'EURJPY-OTC'
function resolveEngineSymbol(assetId: string, assetSymbol: string): string {
  // If already in engine format (EURJPY-OTC)
  if (/^[A-Z]+-OTC$/i.test(assetSymbol)) return assetSymbol.toUpperCase()

  // From slug format: 'eur-jpy-otc' → 'EURJPY-OTC'
  if (/-otc$/i.test(assetId)) {
    return assetId.replace(/-otc$/i, '').replace(/-/g, '').toUpperCase() + '-OTC'
  }

  // From display format: 'EUR/JPY (OTC)' → 'EURJPY-OTC'
  const cleaned = assetSymbol
    .replace(/\(\s*otc\s*\)/ig, '')
    .replace(/[\/ \-]/g, '')
    .toUpperCase()
    .trim()
  
  return cleaned + '-OTC'
}
