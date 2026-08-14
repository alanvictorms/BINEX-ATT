'use client'

import { useCallback, useEffect, useState, Fragment } from 'react'
import {
  Globe, Save, Check, Loader2, RefreshCw, ChevronDown, ChevronUp,
  Type, FileText, Zap, BookOpen, BarChart2, Users, Shield, HelpCircle,
  Megaphone, Building2, X, Plus, Trash2, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND_FALLBACK } from '@/lib/brand'
import { DEFAULT_CONTENT, type SiteContent } from '@/lib/siteContent'

type SectionKey = 'brand' | 'hero' | 'highlights' | 'steps' | 'assets' | 'copyTrading' | 'security' | 'faq' | 'cta' | 'company' | 'footer'

const SECTIONS: Array<{ key: SectionKey; label: string; icon: any; desc: string }> = [
  { key: 'brand',       label: 'Marca e SEO',       icon: Globe,     desc: 'Nome do site, titulo e meta description' },
  { key: 'hero',        label: 'Hero (Banner)',     icon: Type,       desc: 'Titulo principal, subtitulo e botoes' },
  { key: 'highlights',  label: 'Destaques',         icon: Zap,        desc: '4 cards de beneficios abaixo do hero' },
  { key: 'steps',       label: 'Como Funciona',     icon: BookOpen,   desc: '3 passos para comecar' },
  { key: 'assets',      label: 'Ativos',            icon: BarChart2,  desc: 'Categorias de ativos negociaveis' },
  { key: 'copyTrading', label: 'Copy Trading',      icon: Users,      desc: 'Secao de copy trading' },
  { key: 'security',    label: 'Seguranca',         icon: Shield,     desc: 'Pilares de seguranca e transparencia' },
  { key: 'faq',         label: 'Perguntas Frequentes', icon: HelpCircle, desc: 'FAQ da landing page' },
  { key: 'cta',         label: 'CTA Final',         icon: Megaphone,  desc: 'Chamada para acao no fim da pagina' },
  { key: 'company',     label: 'Empresa e Contato', icon: Building2,  desc: 'Dados da empresa, emails e rodape' },
]

export default function SiteConfigPage() {
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT)
  const [original, setOriginal] = useState<SiteContent>(DEFAULT_CONTENT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['brand']))

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/site-config')
      if (!res.ok) throw new Error('Falha ao carregar')
      const data = await res.json()
      const merged = data.content ? deepMerge(DEFAULT_CONTENT, data.content) : DEFAULT_CONTENT
      setContent(merged as SiteContent)
      setOriginal(merged as SiteContent)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const dirty = JSON.stringify(content) !== JSON.stringify(original)

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/admin/site-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      setOriginal(content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function toggle(key: SectionKey) {
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#6b7280]" size={24} /></div>
  }

  return (
    <div className="p-4 md:p-6 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Globe size={20} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Configuracao do Site</h1>
          <p className="text-xs text-[#6b7280]">Edite todos os textos e informacoes da landing page</p>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {/* Sections accordion */}
      <div className="max-w-4xl space-y-2 mb-6">
        {SECTIONS.map(({ key, label, icon: Icon, desc }) => {
          const isOpen = openSections.has(key)
          return (
            <div key={key} className="bg-[#111827] border border-[#1e2433] rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <Icon size={16} className="text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{label}</div>
                  <div className="text-[10px] text-[#6b7280]">{desc}</div>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-[#6b7280]" /> : <ChevronDown size={16} className="text-[#6b7280]" />}
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-[#1e2433] pt-4">
                  {key === 'brand'       && <BrandEditor content={content} setContent={setContent} />}
                  {key === 'hero'        && <HeroEditor content={content} setContent={setContent} />}
                  {key === 'highlights'  && <HighlightsEditor content={content} setContent={setContent} />}
                  {key === 'steps'       && <StepsEditor content={content} setContent={setContent} />}
                  {key === 'assets'      && <AssetsEditor content={content} setContent={setContent} />}
                  {key === 'copyTrading' && <CopyTradingEditor content={content} setContent={setContent} />}
                  {key === 'security'    && <SecurityEditor content={content} setContent={setContent} />}
                  {key === 'faq'         && <FaqEditor content={content} setContent={setContent} />}
                  {key === 'cta'         && <CtaEditor content={content} setContent={setContent} />}
                  {key === 'company'     && <CompanyEditor content={content} setContent={setContent} />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 bg-[#060A11] border-t border-[#1e2433] -mx-4 md:-mx-6 px-4 md:px-6 py-3 flex items-center justify-between">
        <p className="text-[10px] text-[#4b5563]">
          Alteracoes sao aplicadas na landing page apos salvar. Cache do Next.js pode levar ate 60s para refletir.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-xs font-semibold text-[#9ca3af] hover:text-white transition-colors">
            <RefreshCw size={13} /> Recarregar
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition-colors',
              dirty && !saving ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-[#1a2030] text-[#6b7280] cursor-not-allowed'
            )}
          >
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar tudo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
type EP = { content: SiteContent; setContent: (fn: (c: SiteContent) => SiteContent) => void }

function Field({ label, value, onChange, multiline, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string
}) {
  const cls = 'w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:border-blue-500'
  return (
    <div>
      <label className="block text-[10px] text-[#6b7280] mb-1.5 font-bold tracking-wide">{label}</label>
      {multiline ? (
        <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  )
}

// ── Section Editors ─────────────────────────────────────────────────────────
function BrandEditor({ content: c, setContent: set }: EP) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="NOME DA MARCA (header/trade)" value={c.brand.name} onChange={v => set(p => ({ ...p, brand: { ...p.brand, name: v } }))} placeholder={BRAND_FALLBACK.name} />
        <Field label="NOME COMPLETO (titulo da aba)" value={c.brand.fullName} onChange={v => set(p => ({ ...p, brand: { ...p.brand, fullName: v } }))} placeholder={BRAND_FALLBACK.fullName} />
        <Field label="SUBTITULO (abaixo do nome no trade)" value={c.brand.subtitle} onChange={v => set(p => ({ ...p, brand: { ...p.brand, subtitle: v } }))} placeholder="WEB TRADING PLATFORM" />
        <Field label="URL DO LOGO (imagem PNG/SVG)" value={c.brand.logoUrl} onChange={v => set(p => ({ ...p, brand: { ...p.brand, logoUrl: v } }))} placeholder="https://... (vazio = logo padrao)" />
      </div>

      {/* Logo da tela de trade: icone + nome, ou logo horizontal unico */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 rounded-lg bg-[#0a0e16] border border-[#1e2433]">
        <div>
          <label className="block text-[10px] text-[#6b7280] mb-1.5 font-bold tracking-wide">MODO DO LOGO</label>
          <select
            value={c.brand.logoMode}
            onChange={e => set(p => ({ ...p, brand: { ...p.brand, logoMode: e.target.value as 'icon-text' | 'wide' } }))}
            className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="icon-text">Icone (imagem) + nome em texto</option>
            <option value="wide">Logo unico horizontal (altura fixa)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-[#6b7280] mb-1.5 font-bold tracking-wide">APLICAR EM</label>
          <select
            value={c.brand.logoScope}
            onChange={e => set(p => ({ ...p, brand: { ...p.brand, logoScope: e.target.value as 'trade' | 'both' } }))}
            className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="trade">Somente tela de trade</option>
            <option value="both">Header do site + tela de trade</option>
          </select>
        </div>
        <Field label="URL DO LOGO HORIZONTAL" value={c.brand.logoWideUrl} onChange={v => set(p => ({ ...p, brand: { ...p.brand, logoWideUrl: v } }))} placeholder="https://... (logo completo)" />
        {c.brand.logoMode === 'wide' && c.brand.logoWideUrl && (
          <div className="sm:col-span-3 flex items-center gap-3 p-3 rounded-lg bg-[#060A11] border border-[#1e2433]">
            <img src={c.brand.logoWideUrl} alt="Preview logo horizontal" style={{ height: 34, width: 'auto', objectFit: 'contain' }} onError={e => (e.currentTarget.style.display = 'none')} />
            <span className="text-xs text-[#6b7280]">Preview na altura real da tela de trade (34px)</span>
          </div>
        )}
      </div>
      {c.brand.logoUrl && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0a0e16] border border-[#1e2433]">
          <img src={c.brand.logoUrl} alt="Logo preview" className="w-10 h-10 object-contain rounded" onError={e => (e.currentTarget.style.display = 'none')} />
          <span className="text-xs text-[#6b7280]">Preview do logo</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="TITULO SEO (tag title)" value={c.meta.title} onChange={v => set(p => ({ ...p, meta: { ...p.meta, title: v } }))} />
        <Field label="DESCRICAO SEO (meta description)" value={c.meta.description} onChange={v => set(p => ({ ...p, meta: { ...p.meta, description: v } }))} multiline />
      </div>
    </div>
  )
}

function HeroEditor({ content: c, setContent: set }: EP) {
  const h = c.hero
  const u = (k: string, v: string) => set(p => ({ ...p, hero: { ...p.hero, [k]: v } }))
  return (
    <div className="space-y-4">
      <Field label="BADGE (tag acima do titulo)" value={h.badge} onChange={v => u('badge', v)} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="TITULO (parte normal)" value={h.title} onChange={v => u('title', v)} />
        <Field label="TITULO (parte colorida/destaque)" value={h.titleHighlight} onChange={v => u('titleHighlight', v)} />
      </div>
      <Field label="SUBTITULO" value={h.subtitle} onChange={v => u('subtitle', v)} multiline />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="BOTAO PRINCIPAL (CTA)" value={h.ctaPrimary} onChange={v => u('ctaPrimary', v)} />
        <Field label="BOTAO SECUNDARIO" value={h.ctaSecondary} onChange={v => u('ctaSecondary', v)} />
      </div>
      <Field label="AVISO DE RISCO (abaixo dos botoes)" value={h.disclaimer} onChange={v => u('disclaimer', v)} multiline />
    </div>
  )
}

function HighlightsEditor({ content: c, setContent: set }: EP) {
  const items = c.highlights
  function upd(idx: number, k: 'title' | 'text', v: string) {
    set(p => {
      const h = [...p.highlights]
      h[idx] = { ...h[idx], [k]: v }
      return { ...p, highlights: h }
    })
  }
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-[#0a0e16] rounded-lg p-3 border border-[#1e2433]">
          <div className="text-[10px] text-[#4b5563] font-bold mb-2">DESTAQUE {i+1}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="TITULO" value={item.title} onChange={v => upd(i, 'title', v)} />
            <Field label="TEXTO" value={item.text} onChange={v => upd(i, 'text', v)} />
          </div>
        </div>
      ))}
    </div>
  )
}

function StepsEditor({ content: c, setContent: set }: EP) {
  function upd(idx: number, k: 'n' | 'title' | 'text', v: string) {
    set(p => {
      const s = [...p.steps]
      s[idx] = { ...s[idx], [k]: v }
      return { ...p, steps: s }
    })
  }
  return (
    <div className="space-y-3">
      {c.steps.map((step, i) => (
        <div key={i} className="bg-[#0a0e16] rounded-lg p-3 border border-[#1e2433]">
          <div className="text-[10px] text-[#4b5563] font-bold mb-2">PASSO {step.n}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="NUMERO" value={step.n} onChange={v => upd(i, 'n', v)} />
            <Field label="TITULO" value={step.title} onChange={v => upd(i, 'title', v)} />
            <Field label="TEXTO" value={step.text} onChange={v => upd(i, 'text', v)} />
          </div>
        </div>
      ))}
    </div>
  )
}

function AssetsEditor({ content: c, setContent: set }: EP) {
  function upd(idx: number, k: 'name' | 'examples', v: string) {
    set(p => {
      const cats = [...p.assets.categories]
      cats[idx] = { ...cats[idx], [k]: v }
      return { ...p, assets: { ...p.assets, categories: cats } }
    })
  }
  return (
    <div className="space-y-4">
      <Field label="TITULO DA SECAO" value={c.assets.title} onChange={v => set(p => ({ ...p, assets: { ...p.assets, title: v } }))} />
      {c.assets.categories.map((cat, i) => (
        <div key={i} className="bg-[#0a0e16] rounded-lg p-3 border border-[#1e2433]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="CATEGORIA" value={cat.name} onChange={v => upd(i, 'name', v)} />
            <Field label="EXEMPLOS" value={cat.examples} onChange={v => upd(i, 'examples', v)} />
          </div>
        </div>
      ))}
      <Field label="NOTA SOBRE OTC" value={c.assets.otcNote} onChange={v => set(p => ({ ...p, assets: { ...p.assets, otcNote: v } }))} multiline />
    </div>
  )
}

function CopyTradingEditor({ content: c, setContent: set }: EP) {
  const ct = c.copyTrading
  function upd(idx: number, k: 'title' | 'text', v: string) {
    set(p => {
      const f = [...p.copyTrading.features]
      f[idx] = { ...f[idx], [k]: v }
      return { ...p, copyTrading: { ...p.copyTrading, features: f } }
    })
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="BADGE" value={ct.badge} onChange={v => set(p => ({ ...p, copyTrading: { ...p.copyTrading, badge: v } }))} />
        <Field label="TITULO" value={ct.title} onChange={v => set(p => ({ ...p, copyTrading: { ...p.copyTrading, title: v } }))} />
      </div>
      <Field label="SUBTITULO" value={ct.subtitle} onChange={v => set(p => ({ ...p, copyTrading: { ...p.copyTrading, subtitle: v } }))} multiline />
      {ct.features.map((f, i) => (
        <div key={i} className="bg-[#0a0e16] rounded-lg p-3 border border-[#1e2433]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`FEATURE ${i+1} TITULO`} value={f.title} onChange={v => upd(i, 'title', v)} />
            <Field label={`FEATURE ${i+1} TEXTO`} value={f.text} onChange={v => upd(i, 'text', v)} />
          </div>
        </div>
      ))}
      <Field label="DISCLAIMER" value={ct.disclaimer} onChange={v => set(p => ({ ...p, copyTrading: { ...p.copyTrading, disclaimer: v } }))} multiline />
    </div>
  )
}

function SecurityEditor({ content: c, setContent: set }: EP) {
  function upd(idx: number, k: 'title' | 'text', v: string) {
    set(p => {
      const pl = [...p.security.pillars]
      pl[idx] = { ...pl[idx], [k]: v }
      return { ...p, security: { ...p.security, pillars: pl } }
    })
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="TITULO" value={c.security.title} onChange={v => set(p => ({ ...p, security: { ...p.security, title: v } }))} />
        <Field label="SUBTITULO" value={c.security.subtitle} onChange={v => set(p => ({ ...p, security: { ...p.security, subtitle: v } }))} />
      </div>
      {c.security.pillars.map((p, i) => (
        <div key={i} className="bg-[#0a0e16] rounded-lg p-3 border border-[#1e2433]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`PILAR ${i+1} TITULO`} value={p.title} onChange={v => upd(i, 'title', v)} />
            <Field label={`PILAR ${i+1} TEXTO`} value={p.text} onChange={v => upd(i, 'text', v)} />
          </div>
        </div>
      ))}
    </div>
  )
}

function FaqEditor({ content: c, setContent: set }: EP) {
  function upd(idx: number, k: 'q' | 'a', v: string) {
    set(p => {
      const f = [...p.faq]
      f[idx] = { ...f[idx], [k]: v }
      return { ...p, faq: f }
    })
  }
  function add() {
    set(p => ({ ...p, faq: [...p.faq, { q: '', a: '' }] }))
  }
  function remove(idx: number) {
    set(p => ({ ...p, faq: p.faq.filter((_, i) => i !== idx) }))
  }
  return (
    <div className="space-y-3">
      {c.faq.map((item, i) => (
        <div key={i} className="bg-[#0a0e16] rounded-lg p-3 border border-[#1e2433]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-[#4b5563] font-bold">PERGUNTA {i+1}</div>
            <button onClick={() => remove(i)} className="text-red-400/50 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
          </div>
          <Field label="PERGUNTA" value={item.q} onChange={v => upd(i, 'q', v)} />
          <div className="mt-2">
            <Field label="RESPOSTA" value={item.a} onChange={v => upd(i, 'a', v)} multiline />
          </div>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-[#2a3448] text-[#6b7280] text-xs font-medium hover:text-white hover:border-[#3a4a60] transition-colors">
        <Plus size={13} /> Adicionar pergunta
      </button>
    </div>
  )
}

function CtaEditor({ content: c, setContent: set }: EP) {
  return (
    <div className="space-y-4">
      <Field label="TITULO" value={c.cta.title} onChange={v => set(p => ({ ...p, cta: { ...p.cta, title: v } }))} />
      <Field label="SUBTITULO" value={c.cta.subtitle} onChange={v => set(p => ({ ...p, cta: { ...p.cta, subtitle: v } }))} multiline />
      <Field label="TEXTO DO BOTAO" value={c.cta.button} onChange={v => set(p => ({ ...p, cta: { ...p.cta, button: v } }))} />
    </div>
  )
}

function CompanyEditor({ content: c, setContent: set }: EP) {
  const e = c.company.emails
  const ue = (k: string, v: string) => set(p => ({ ...p, company: { ...p.company, emails: { ...p.company.emails, [k]: v } } }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="MARCA" value={c.company.brand} onChange={v => set(p => ({ ...p, company: { ...p.company, brand: v } }))} />
        <Field label="SITE" value={c.company.site} onChange={v => set(p => ({ ...p, company: { ...p.company, site: v } }))} />
        <div>
          <label className="block text-[10px] text-[#6b7280] mb-1.5 font-bold tracking-wide">IDADE MINIMA</label>
          <input type="number" value={c.company.minAge} onChange={e => set(p => ({ ...p, company: { ...p.company, minAge: parseInt(e.target.value) || 18 } }))} className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
      </div>
      <div className="border-t border-[#1e2433] pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail size={13} className="text-blue-400" />
          <span className="text-xs font-bold text-white">Emails de contato</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="SUPORTE" value={e.suporte} onChange={v => ue('suporte', v)} />
          <Field label="PRIVACIDADE" value={e.privacidade} onChange={v => ue('privacidade', v)} />
          <Field label="COMPLIANCE" value={e.compliance} onChange={v => ue('compliance', v)} />
          <Field label="JURIDICO" value={e.juridico} onChange={v => ue('juridico', v)} />
          <Field label="OUVIDORIA" value={e.ouvidoria} onChange={v => ue('ouvidoria', v)} />
        </div>
      </div>
      <div className="border-t border-[#1e2433] pt-4">
        <div className="text-xs font-bold text-white mb-3">Rodape</div>
        <div className="space-y-3">
          <Field label="DESCRICAO DO RODAPE" value={c.footer.description} onChange={v => set(p => ({ ...p, footer: { ...p.footer, description: v } }))} multiline />
          <Field label="DISCLAIMER INSTITUCIONAL" value={c.footer.disclaimer} onChange={v => set(p => ({ ...p, footer: { ...p.footer, disclaimer: v } }))} multiline />
          <Field label="AVISO DE RISCO" value={c.footer.riskWarning} onChange={v => set(p => ({ ...p, footer: { ...p.footer, riskWarning: v } }))} multiline />
        </div>
      </div>
    </div>
  )
}

// Deep merge utility (client-side)
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
  return result
}
