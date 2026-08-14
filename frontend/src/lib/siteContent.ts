import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { BRAND_DOMAIN, BRAND_FALLBACK, type Brand } from './brand'

/** Tag do cache. O POST de /api/admin/site-config invalida por ela ao salvar. */
export const SITE_CONTENT_TAG = 'site-content'

export type SiteContent = {
  brand: Brand
  meta: { title: string; description: string }
  hero: {
    badge: string
    title: string
    titleHighlight: string
    subtitle: string
    ctaPrimary: string
    ctaSecondary: string
    disclaimer: string
  }
  highlights: Array<{ title: string; text: string }>
  steps: Array<{ n: string; title: string; text: string }>
  assets: {
    title: string
    categories: Array<{ name: string; examples: string }>
    otcNote: string
  }
  copyTrading: {
    badge: string
    title: string
    subtitle: string
    features: Array<{ title: string; text: string }>
    disclaimer: string
  }
  security: {
    title: string
    subtitle: string
    pillars: Array<{ title: string; text: string }>
  }
  faq: Array<{ q: string; a: string }>
  cta: { title: string; subtitle: string; button: string }
  company: {
    brand: string
    site: string
    minAge: number
    emails: {
      suporte: string
      privacidade: string
      compliance: string
      juridico: string
      ouvidoria: string
    }
  }
  footer: {
    description: string
    disclaimer: string
    riskWarning: string
  }
}

export const DEFAULT_CONTENT: SiteContent = {
  brand: BRAND_FALLBACK,
  meta: {
    title: `${BRAND_FALLBACK.fullName} — Opções digitais com conta demo gratuita`,
    description: 'Negocie opções digitais em moedas, cripto e commodities. Conta demonstração gratuita, depósito e saque via Pix.',
  },
  hero: {
    badge: 'Conta demonstração gratuita, sem depósito',
    title: 'Opere opções digitais com',
    titleHighlight: 'regras claras',
    subtitle: 'Moedas, criptomoedas e commodities em prazos de 5 segundos a horas. Depósito e saque via Pix. Payout exibido antes de cada entrada — sem letra miúda na hora de operar.',
    ctaPrimary: 'Abrir conta gratuita',
    ctaSecondary: 'Já tenho conta',
    disclaimer: 'Produto de risco elevado. Você pode perder todo o capital investido.',
  },
  highlights: [
    { title: 'Pix automático', text: 'Depósito confirmado em minutos, sem aprovação manual' },
    { title: 'Payout até 92%', text: 'O percentual vigente aparece antes de você confirmar' },
    { title: 'Demo ilimitada', text: 'Saldo virtual pra treinar, sem depositar nada' },
    { title: 'Resultado no servidor', text: 'Apuração server-side e registro auditável de cada operação' },
  ],
  steps: [
    { n: '01', title: 'Crie sua conta', text: 'E-mail e senha bastam para começar na conta demonstração. A verificação de identidade só é exigida antes do primeiro saque.' },
    { n: '02', title: 'Treine sem risco', text: 'A conta demo vem com saldo virtual e as mesmas telas da conta real. Use para entender o produto antes de colocar dinheiro.' },
    { n: '03', title: 'Deposite e opere', text: 'Depósito por Pix ou USDT. Escolha ativo, valor, direção e tempo de expiração. O resultado é apurado pelo servidor na expiração.' },
  ],
  assets: {
    title: 'O que dá para negociar',
    categories: [
      { name: 'Moedas', examples: 'EUR/USD, GBP/USD, USD/JPY e outros pares' },
      { name: 'Criptomoedas', examples: 'BTC, ETH e principais altcoins' },
      { name: 'Matérias-primas', examples: 'Ouro, prata e petróleo' },
    ],
    otcNote: 'Ativos marcados como OTC têm preço sintético gerado pela plataforma, que atua como contraparte da operação, e ficam disponíveis inclusive nos fins de semana.',
  },
  copyTrading: {
    badge: 'Copy Trading',
    title: 'Opere ao lado de quem já está indo bem',
    subtitle: 'Escolha um operador pelo desempenho dele na plataforma e replique as entradas automaticamente na sua conta.',
    features: [
      { title: 'Desempenho à vista', text: 'Cada operador tem o percentual de acerto e de perda visível antes de você seguir.' },
      { title: 'Replicação automática', text: 'Entrou na sua lista, as operações dele passam a ser abertas na sua conta no mesmo momento.' },
      { title: 'Você manda', text: 'Pare de copiar quando quiser, com um clique. Seguir alguém não entrega o controle da sua conta a ninguém.' },
    ],
    disclaimer: 'Copiar replica as decisões de outra pessoa, não elimina o risco.',
  },
  security: {
    title: 'Segurança e transparência',
    subtitle: 'Regra escrita, execução verificável e informação disponível antes do depósito.',
    pillars: [
      { title: 'Apuração no servidor', text: 'Preço de entrada e resultado são registrados e apurados pelo servidor.' },
      { title: 'Acesso administrativo protegido', text: 'Autenticação em dois fatores obrigatória no painel interno e log de auditoria.' },
      { title: 'Verificação de identidade', text: 'KYC exigido antes do primeiro saque, com regra de titularidade própria.' },
      { title: 'Regras publicadas', text: 'Termos, bônus, saques, execução e privacidade estão escritos e acessíveis antes de você depositar.' },
    ],
  },
  faq: [
    { q: 'Preciso depositar para testar?', a: 'Não. A conta demonstração é criada junto com o cadastro, tem saldo virtual e usa as mesmas telas da conta real.' },
    { q: 'Quanto tempo leva um saque?', a: 'A análise costuma levar até 1 dia útil. Aprovado o saque, a liquidação por Pix costuma sair em minutos.' },
    { q: 'O bônus prende meu dinheiro?', a: 'Aceitar um bônus condiciona o saque ao cumprimento de um volume de negociação (rollover).' },
    { q: 'Posso perder mais do que depositei?', a: 'Não. A perda máxima em cada operação é o valor investido nela.' },
  ],
  cta: {
    title: 'Comece pela conta demonstração',
    subtitle: 'Sem depósito, sem cartão. Entenda o produto primeiro — decidir depois é sempre mais barato.',
    button: 'Criar conta gratuita',
  },
  company: {
    brand: BRAND_FALLBACK.fullName,
    site: BRAND_DOMAIN,
    minAge: 18,
    emails: {
      suporte: `suporte@${BRAND_DOMAIN}`,
      privacidade: `privacidade@${BRAND_DOMAIN}`,
      compliance: `compliance@${BRAND_DOMAIN}`,
      juridico: `juridico@${BRAND_DOMAIN}`,
      ouvidoria: `ouvidoria@${BRAND_DOMAIN}`,
    },
  },
  footer: {
    description: 'Plataforma de negociação de opções digitais. Conta demonstração gratuita, depósito e saque via Pix.',
    disclaimer: 'Não é instituição financeira, não presta consultoria de investimento e não possui registro ou autorização de órgão regulador.',
    riskWarning: 'A negociação de opções digitais envolve risco elevado e pode resultar na perda total do capital investido. Não invista dinheiro que você não pode perder.',
  },
}

const loadSiteContent = unstable_cache(
  async function loadSiteContent(): Promise<SiteContent> {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'site_content')
        .single()

      if (data?.value) {
        // Deep merge with defaults to fill any missing fields
        return deepMerge(DEFAULT_CONTENT, data.value as any) as SiteContent
      }
    } catch (e) {
      console.error('[getSiteContent]', e)
    }
    return DEFAULT_CONTENT
  },
  ['site-content'],
  { tags: [SITE_CONTENT_TAG], revalidate: 60 }
)

/**
 * Conteúdo do site, do banco.
 *
 * Duas camadas de cache, de propósito:
 *
 * - `unstable_cache` guarda entre requests, com tag e teto de 60s. Sem isso, o
 *   layout raiz (que agora resolve a marca no servidor) faria uma consulta ao
 *   Supabase a cada carregamento de página, inclusive no /trade.
 * - `cache()` do React dedupa dentro do mesmo request: o layout raiz chama
 *   isto duas vezes — no `generateMetadata` e pra montar o BrandProvider — e
 *   só uma consulta acontece.
 *
 * Salvar em /admin/site invalida a tag, então a mudança aparece sem esperar
 * os 60s. Ver docs/plano-rebrand.md.
 */
export const getSiteContent = cache(() => loadSiteContent())

function deepMerge(defaults: any, overrides: any): any {
  if (!overrides || typeof overrides !== 'object') return defaults
  if (Array.isArray(defaults)) return overrides.length > 0 ? overrides : defaults
  const result = { ...defaults }
  for (const key of Object.keys(defaults)) {
    if (overrides[key] !== undefined && overrides[key] !== null && overrides[key] !== '') {
      if (typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
        result[key] = deepMerge(defaults[key], overrides[key])
      } else {
        result[key] = overrides[key]
      }
    }
  }
  // Also copy keys from overrides that aren't in defaults
  for (const key of Object.keys(overrides)) {
    if (!(key in defaults)) result[key] = overrides[key]
  }
  return result
}
