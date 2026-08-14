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

// GET /api/admin/manipulation/orders?status=OPEN|CLOSED|ALL
export async function GET(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'OPEN'

  let query = supabase
    .from('operations')
    .select(`
      id,
      account_id,
      asset_id,
      asset_symbol,
      direction,
      amount,
      payout_pct,
      entry_price,
      exit_price,
      status,
      profit,
      created_at,
      expires_at,
      closed_at,
      accounts!inner(user_id, type)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status === 'OPEN') {
    query = query.eq('status', 'OPEN')
  } else if (status === 'CLOSED') {
    query = query.in('status', ['WON', 'LOST', 'DRAW'])
  }
  // 'ALL' = no filter

  const { data, error } = await query

  if (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Collect unique user_ids to fetch emails from auth.users
  const userIds = [...new Set((data ?? []).map((op: any) => op.accounts?.user_id).filter(Boolean))]
  const emailMap: Record<string, string> = {}

  if (userIds.length > 0) {
    // Use admin API to get user emails
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (users) {
      for (const u of users) {
        emailMap[u.id] = u.email ?? 'N/A'
      }
    }
  }

  const orders = (data ?? []).map((op: any) => {
    const account = op.accounts
    const userId = account?.user_id
    return {
      id: op.id,
      account_id: op.account_id,
      user_email: emailMap[userId] ?? userId?.slice(0, 8) ?? 'N/A',
      account_type: account?.type ?? 'unknown',
      asset_id: op.asset_id,
      asset_symbol: op.asset_symbol,
      direction: op.direction,
      amount: op.amount,
      payout_pct: op.payout_pct,
      entry_price: op.entry_price,
      exit_price: op.exit_price,
      status: op.status,
      profit: op.profit,
      created_at: op.created_at,
      expires_at: op.expires_at,
      closed_at: op.closed_at,
    }
  })

  return NextResponse.json({ orders })
}
