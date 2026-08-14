import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { SITE_CONTENT_TAG } from '@/lib/siteContent'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function verifyAdmin(req: NextRequest) {
  const adminClient = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} },
  })
  const { data: { user }, error } = await adminClient.auth.getUser()
  if (error || !user) return null
  const { data: isAdmin } = await adminClient.rpc('is_admin', { uid: user.id })
  if (!isAdmin) return null
  return user
}

// GET - load site content
export async function GET(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'site_content')
    .single()

  return NextResponse.json({ content: data?.value ?? null })
}

// POST - save site content
export async function POST(req: NextRequest) {
  const user = await verifyAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key: 'site_content', value: body.content, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Derruba o cache do conteúdo — sem isto a edição só apareceria quando os
  // 60s do unstable_cache vencessem. `updateTag` seria imediato, mas só roda
  // em Server Action; em Route Handler o caminho é este.
  revalidateTag(SITE_CONTENT_TAG, 'max')

  return NextResponse.json({ success: true })
}
