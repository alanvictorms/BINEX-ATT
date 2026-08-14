import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const BSPAY_BASE = 'https://api.bspay.co/v2'
const CLIENT_ID  = process.env.BSPAY_CLIENT_ID!
const CLIENT_SECRET = process.env.BSPAY_CLIENT_SECRET!
const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET!
// BSPay tem allowlist de User-Agent — o valor precisa estar liberado no dashboard.
// Sem isso (fetch do Node manda 'node'), o BSPay rejeita com INVALID_CREDENTIALS.
const USER_AGENT = process.env.BSPAY_USER_AGENT ?? 'VertexMarkets/1.0'

let tokenCache: { token: string; expiresAt: number } | null = null

async function getBspayToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${BSPAY_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BSPay auth failed: ${text}`)
  }

  const data = await res.json()
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return tokenCache.token
}

// A identidade do depositante vem da SESSÃO, nunca do corpo da requisição.
//
// Como era antes (aberto de 29/05 a 05/08): a rota lia `userId` e `accountId` do JSON
// e só conferia se não vinham vazios — a mensagem "Usuário não autenticado" era teste
// de presença, não de sessão. Depois gravava com service-role, que passa por cima do
// RLS. Qualquer um criava depósito no nome de qualquer conta; com o bônus escalonado
// de até 200%, isso vira saldo sem rollover.
//
// Agora: `amount` é a única coisa que o cliente escolhe. O usuário sai do cookie de
// sessão e a conta é buscada no banco (1 conta REAL por usuário — 306/306 em prod).
export async function POST(req: NextRequest) {
  try {
    const { amount } = await req.json()

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
    }

    // 1. Quem está pedindo — lido do cookie, igual à rota de payout do admin.
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Faça login para depositar.' }, { status: 401 })
    }

    // Cliente service-role: necessário p/ ler a config e p/ gravar o depósito
    // (o RLS de deposits exige auth.uid() = user_id, e aqui a escrita é do servidor).
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[PIX create] SUPABASE_SERVICE_ROLE_KEY ausente — insert seria bloqueado pelo RLS')
      return NextResponse.json({ error: 'Configuração de pagamento incompleta (service role).' }, { status: 500 })
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    // 2. A conta de destino é sempre a REAL do próprio usuário — não é parâmetro.
    const userId = user.id
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'REAL')
      .single()

    if (accErr || !account) {
      console.error('[PIX create] conta REAL não encontrada para', userId, accErr)
      return NextResponse.json({ error: 'Conta para depósito não encontrada.' }, { status: 400 })
    }
    const accountId = account.id

    // Limites de depósito configuráveis (Admin → Configurações)
    const { data: cfg } = await supabase.rpc('get_public_config')
    const depMin = Number((cfg as any)?.depositMin ?? 50)
    const depMax = Number((cfg as any)?.depositMax ?? 5000)
    if (amount < depMin) {
      return NextResponse.json({ error: `Valor mínimo para depósito: R$ ${depMin}` }, { status: 400 })
    }
    if (depMax > 0 && amount > depMax) {
      return NextResponse.json({ error: `Valor máximo para depósito: R$ ${depMax}` }, { status: 400 })
    }

    const externalId = `vtx_${userId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`

    // TESTE Cloudflare-bypass: aponta o webhook pra URL DIRETA do EasyPanel (nao
    // passa pela Cloudflare). Se o BSPay entregar aqui mas nao em vertexmarkets.co,
    // a Cloudflare estava bloqueando a chamada de entrada do BSPay.
    // Configuravel via WEBHOOK_BASE_URL; default = URL direta do EasyPanel.
    const webhookBase = process.env.WEBHOOK_BASE_URL
      ?? 'https://n8n-vertex-web.oloyi2.easypanel.host'
    const postbackUrl = `${webhookBase}/api/payments/pix/webhook`

    const token = await getBspayToken()

    const bspayRes = await fetch(`${BSPAY_BASE}/transactions/cashin`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        amount,
        currency: 'BRL',
        external_id: externalId,
        postback_url: postbackUrl,
      }),
    })

    if (!bspayRes.ok) {
      const text = await bspayRes.text()
      throw new Error(`BSPay cashin failed: ${text}`)
    }

    const bspayData = await bspayRes.json()
    const qrcode = bspayData?.data?.payment_info?.qrcode ?? bspayData?.data?.qrcode ?? null
    const bspayId = bspayData?.data?.id ?? bspayData?.data?.transaction_id ?? null

    // Salva depósito pendente no Supabase (service-role criado acima).
    const { error: insErr } = await supabase.from('deposits').insert({
      user_id:     userId,
      account_id:  accountId,
      external_id: externalId,
      bspay_id:    bspayId,
      amount,
      status:      'pending',
      qrcode,
    })
    if (insErr) {
      console.error('[PIX create] falha ao gravar deposito:', insErr)
      return NextResponse.json({ error: 'Falha ao registrar depósito. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ externalId, qrcode, amount })
  } catch (err: any) {
    console.error('[PIX create]', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
