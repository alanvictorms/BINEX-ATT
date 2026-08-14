// Atribuicao de marketing (TrackFlow): captura o `ref` (= click_id do tracker)
// e utms/fbclid da URL e guarda no localStorage.
//
// Por que no localStorage e em QUALQUER pagina (rodado pelo AuthProvider):
// o link de anuncio chega em /signup?ref=... mas /register redireciona pra
// /login DESCARTANDO os query params. Capturar cedo e persistir local garante
// que o `ref` sobrevive ate o cadastro, independente da rota de entrada.
//
// Contrato com o TrackFlow: o `ref` capturado aqui e devolvido em todo evento
// (registration/ftd/deposit). Ver memory project_trackflow_integration.

const KEY = 'vertex:attribution'

export interface Attribution {
  ref:           string | null   // click_id do TrackFlow; null se organico
  utm_source?:   string
  utm_medium?:   string
  utm_campaign?: string
  utm_content?:  string
  utm_term?:     string
  fbclid?:       string
  captured_at:   string
  landing_url:   string
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/**
 * Le os parametros da URL atual e grava a atribuicao.
 * Regra: clique pago mais recente vence (se vier `ref`, sobrescreve). Navegacao
 * interna sem parametros NUNCA apaga uma atribuicao ja salva.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')

  // Sem `ref` na URL e ja existe algo salvo: preserva (nao deixa navegacao interna apagar).
  if (!ref && readAttribution()) return

  const hasUtm = UTM_KEYS.some(k => params.get(k))
  const fbclid = params.get('fbclid')

  // Visita 100% organica e limpa (sem ref/utm/fbclid): nada util pra salvar.
  if (!ref && !fbclid && !hasUtm) return

  const attr: Attribution = {
    ref,
    captured_at: new Date().toISOString(),
    landing_url: window.location.href,
  }
  for (const k of UTM_KEYS) {
    const v = params.get(k)
    if (v) attr[k] = v
  }
  if (fbclid) attr.fbclid = fbclid

  try {
    window.localStorage.setItem(KEY, JSON.stringify(attr))
  } catch {
    /* localStorage indisponivel — ignora */
  }
}

/** Le a atribuicao salva (ou null). Usado no cadastro pra anexar ao signUp. */
export function readAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Attribution) : null
  } catch {
    return null
  }
}

/** Limpa a atribuicao (ex.: apos confirmar que foi enviada ao backend). */
export function clearAttribution(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}

// ── Afiliados (interno, distinto do `ref` do TrackFlow) ─────────────────────────
// Link do afiliado: vertexmarkets.co/?aff=CODIGO. Capturamos cedo e persistimos,
// pois /register descarta os query params (mesma razao do attribution acima).
const AFF_KEY = 'vertex:aff'

/** Captura o codigo de afiliado (?aff=CODIGO) e persiste. Primeiro codigo vence. */
export function captureAffiliate(): void {
  if (typeof window === 'undefined') return
  const code = new URLSearchParams(window.location.search).get('aff')
  if (!code || !code.trim()) return
  if (readAffiliateCode()) return // nao sobrescreve um codigo ja salvo
  try {
    window.localStorage.setItem(AFF_KEY, code.trim())
  } catch {
    /* localStorage indisponivel — ignora */
  }
}

/** Le o codigo de afiliado salvo (ou null). Usado no cadastro para vincular. */
export function readAffiliateCode(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(AFF_KEY)
  } catch {
    return null
  }
}

/** Limpa o codigo de afiliado (apos vincular no backend). */
export function clearAffiliateCode(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(AFF_KEY)
  } catch {
    /* ignora */
  }
}
