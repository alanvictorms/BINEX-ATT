/**
 * E-mails transacionais via Resend (REST API).
 *
 * Regras:
 *  - Server-only (usa service role pra resolver o e-mail do usuário).
 *  - NUNCA lança: falha de e-mail não pode derrubar a operação principal
 *    (confirmação de depósito, pagamento de saque, etc.).
 *  - Dedup por (kind, ref_id) na tabela email_log — webhook reentregue ou
 *    clique duplo não reenvia o mesmo e-mail.
 *  - Sem RESEND_API_KEY configurada vira no-op (loga warning).
 *
 * Visual: mesmo padrão dos templates do Supabase Auth (docs/emails/supabase/).
 */
import { createClient } from '@supabase/supabase-js'
import { BRAND_DOMAIN, BRAND_FALLBACK, BRAND_SHORT } from './brand'

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const FROM    = `${BRAND_FALLBACK.fullName} <noreply@${BRAND_DOMAIN}>`
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? `https://app.${BRAND_DOMAIN}`

// A raiz virou o site institucional; a plataforma logada mora em /trade.
// Botão de e-mail tem que cair dentro da plataforma, não na home de marketing.
const PLATFORM_URL = `${APP_URL}/trade`

export type EmailKind =
  | 'deposit_confirmed'
  | 'withdrawal_requested'
  | 'withdrawal_rejected'
  | 'withdrawal_paid'
  | 'kyc_approved'
  | 'kyc_rejected'
  // Fluxos de conversão (enviados pelo cron /api/cron/email-flows):
  | 'flow_a1' | 'flow_a2' | 'flow_a3' | 'flow_a4'   // ativação (cadastro sem depósito)
  | 'flow_b1' | 'flow_b2'                            // Pix gerado e não pago

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const fmtBRL = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Layout (table-based, estilos inline — compatível Gmail/Outlook) ─────────

interface TemplateParts {
  preheader: string
  title:     string
  bodyHtml:  string   // parágrafos já em HTML
  ctaLabel?: string
  ctaUrl?:   string
  footnote?: string   // linha cinza após o divisor
}

function layout(t: TemplateParts): string {
  const cta = t.ctaLabel && t.ctaUrl ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:28px 0 12px;">
                    <a href="${t.ctaUrl}"
                       style="display:inline-block;background-color:#2563eb;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      ${t.ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>` : ''

  const footnote = t.footnote ? `
              <hr style="border:none;border-top:1px solid #262c3f;margin:28px 0 20px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#7E8DA2;">
                ${t.footnote}
              </p>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#060A11;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${t.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#060A11;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <!-- alt vazio de proposito: cliente que bloqueia imagem colapsa o img
                   e o wordmark em texto segura o cabecalho sozinho. -->
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;letter-spacing:6px;color:#ffffff;">
                <img src="${APP_URL}/marca/simbolo-ui-64.png" width="26" height="26" alt=""
                     style="vertical-align:middle;border:0;margin-right:10px;">${BRAND_FALLBACK.name}
              </span>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0C131F;border:1px solid #262c3f;border-radius:12px;padding:36px 32px;">
              <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#ffffff;">
                ${t.title}
              </h1>
              ${t.bodyHtml}
              ${cta}
              ${footnote}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:#6b7080;">
                &copy; 2026 ${BRAND_FALLBACK.fullName} &mdash; <a href="${APP_URL}" style="color:#6b7080;">${BRAND_DOMAIN}</a><br>
                Por segurança, nunca compartilhe seus dados de acesso com terceiros.<br>
                Operar envolve risco. Negocie com responsabilidade.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

const p = (html: string) =>
  `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#aeb4c0;">${html}</p>`

const highlight = (label: string, value: string) => `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px;">
                <tr>
                  <td align="center" style="background-color:#060A11;border:1px solid #262c3f;border-radius:8px;padding:16px;">
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7E8DA2;">${label}</span><br>
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:#ffffff;">${value}</span>
                  </td>
                </tr>
              </table>`

// ─── Envio com dedup ─────────────────────────────────────────────────────────

interface SendParams {
  kind:    EmailKind
  refId:   string     // id da linha que originou (deposit/withdrawal/submission)
  userId:  string
  subject: string
  html:    string
}

async function sendTransactional(params: SendParams): Promise<void> {
  try {
    if (!RESEND_API_KEY) {
      console.warn(`[email] RESEND_API_KEY ausente — pulando ${params.kind}:${params.refId}`)
      return
    }
    const db = service()

    // 1. Reserva o envio (unique kind+ref_id). Conflito = já enviado, sai.
    const { error: logErr } = await db.from('email_log').insert({
      user_id: params.userId,
      kind:    params.kind,
      ref_id:  params.refId,
    })
    if (logErr) {
      if (logErr.code !== '23505') console.error('[email] email_log insert:', logErr.message)
      return
    }

    // 2. Resolve o e-mail do usuário
    const { data, error: userErr } = await db.auth.admin.getUserById(params.userId)
    const to = data?.user?.email
    if (userErr || !to) {
      console.error(`[email] sem e-mail p/ user ${params.userId}:`, userErr?.message)
      await db.from('email_log').delete().match({ kind: params.kind, ref_id: params.refId })
      return
    }

    // 3. Envia via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body:    JSON.stringify({ from: FROM, to: [to], subject: params.subject, html: params.html }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[email] Resend ${res.status} em ${params.kind}:${params.refId}: ${body}`)
      // Libera o lock pra permitir reenvio numa próxima tentativa
      await db.from('email_log').delete().match({ kind: params.kind, ref_id: params.refId })
      return
    }

    console.log(`[email] enviado ${params.kind}:${params.refId} → ${to}`)
  } catch (err: any) {
    console.error(`[email] erro inesperado ${params.kind}:`, err?.message)
  }
}

// ─── E-mails por evento ──────────────────────────────────────────────────────

export async function emailDepositConfirmed(args: { userId: string; depositId: string; amount: number | string }) {
  await sendTransactional({
    kind:    'deposit_confirmed',
    refId:   args.depositId,
    userId:  args.userId,
    subject: 'Depósito confirmado — saldo disponível',
    html: layout({
      preheader: 'Seu depósito foi confirmado e o saldo já está disponível.',
      title:     'Depósito confirmado ✓',
      bodyHtml:  p('Recebemos seu depósito via Pix e o valor já está disponível na sua conta real:')
               + highlight('Valor creditado', fmtBRL(args.amount)),
      ctaLabel:  'Operar agora',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Não reconhece este depósito? Entre em contato com o suporte pela plataforma imediatamente.',
    }),
  })
}

export async function emailWithdrawalRequested(args: { userId: string; withdrawalId: string; amount: number | string }) {
  await sendTransactional({
    kind:    'withdrawal_requested',
    refId:   args.withdrawalId,
    userId:  args.userId,
    subject: 'Recebemos seu pedido de saque',
    html: layout({
      preheader: 'Seu pedido de saque está em análise.',
      title:     'Pedido de saque recebido',
      bodyHtml:  p('Seu pedido de saque foi registrado e está em análise pela nossa equipe:')
               + highlight('Valor solicitado', fmtBRL(args.amount))
               + p('Você receberá outro e-mail assim que o pagamento for processado. O valor será enviado para a chave Pix cadastrada no pedido.'),
      footnote:  'Não foi você? Acesse a plataforma, cancele o pedido em Conta → Saques e troque sua senha imediatamente.',
    }),
  })
}

export async function emailWithdrawalPaid(args: { userId: string; withdrawalId: string; amount: number | string }) {
  await sendTransactional({
    kind:    'withdrawal_paid',
    refId:   args.withdrawalId,
    userId:  args.userId,
    subject: 'Saque pago — Pix enviado',
    html: layout({
      preheader: 'Seu saque foi pago via Pix.',
      title:     'Saque pago ✓',
      bodyHtml:  p('Seu saque foi processado e o Pix foi enviado para a chave cadastrada:')
               + highlight('Valor pago', fmtBRL(args.amount))
               + p('O valor costuma aparecer na conta de destino em poucos instantes.'),
      ctaLabel:  'Ver histórico',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Qualquer dúvida sobre o pagamento, fale com o suporte pela plataforma.',
    }),
  })
}

export async function emailWithdrawalRejected(args: { userId: string; withdrawalId: string; amount: number | string; reason?: string | null }) {
  const reason = args.reason?.trim()
  await sendTransactional({
    kind:    'withdrawal_rejected',
    refId:   args.withdrawalId,
    userId:  args.userId,
    subject: 'Seu pedido de saque não foi aprovado',
    html: layout({
      preheader: 'Seu pedido de saque não foi aprovado — veja o motivo.',
      title:     'Saque não aprovado',
      bodyHtml:  p(`Seu pedido de saque de <strong style="color:#ffffff;">${fmtBRL(args.amount)}</strong> não foi aprovado e o valor permanece disponível no seu saldo.`)
               + (reason ? p(`<strong style="color:#ffffff;">Motivo:</strong> ${escapeHtml(reason)}`) : ''),
      ctaLabel:  'Falar com o suporte',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Você pode corrigir o que for necessário e solicitar um novo saque a qualquer momento.',
    }),
  })
}

export async function emailKycApproved(args: { userId: string; submissionId: string }) {
  await sendTransactional({
    kind:    'kyc_approved',
    refId:   args.submissionId,
    userId:  args.userId,
    subject: 'Verificação de identidade aprovada',
    html: layout({
      preheader: 'Sua verificação de identidade foi aprovada.',
      title:     'Verificação aprovada ✓',
      bodyHtml:  p('Sua verificação de identidade foi <strong style="color:#ffffff;">aprovada</strong>. Sua conta agora está habilitada para saques.'),
      ctaLabel:  'Acessar plataforma',
      ctaUrl:    PLATFORM_URL,
    }),
  })
}

// ─── Fluxos de conversão (lead → primeiro depósito) ─────────────────────────
// Conteúdo segue docs/emails/estrategia-fluxos-leads.md. Dedup: 1 envio por
// usuário por passo (ref_id = userId nos A; depositId nos B).

export async function emailFlowA1(userId: string) {
  await sendTransactional({
    kind: 'flow_a1', refId: userId, userId,
    subject: `Sua conta ${BRAND_SHORT} está pronta — comece agora`,
    html: layout({
      preheader: 'Treine na conta demo e dobre seu primeiro depósito.',
      title:     `Bem-vindo à ${BRAND_SHORT}! 🚀`,
      bodyHtml:  p('Sua conta está pronta. Você já pode treinar na <strong style="color:#ffffff;">conta demo com saldo virtual</strong> — sem arriscar nada.')
               + p('E quando se sentir pronto: seu primeiro depósito vale <strong style="color:#ffffff;">bônus de 100% até R$ 300</strong>. Depositou R$ 100, opera com R$ 200.'),
      ctaLabel:  'Começar a operar',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Bônus liberado para saque após volume de operações de 20× o valor do bônus. Seu próprio saldo nunca fica preso.',
    }),
  })
}

export async function emailFlowA2(userId: string) {
  await sendTransactional({
    kind: 'flow_a2', refId: userId, userId,
    subject: '3 passos para sua primeira operação',
    html: layout({
      preheader: 'Operar é mais simples do que parece — veja os 3 passos.',
      title:     'Sua primeira operação em 3 passos',
      bodyHtml:  p('<strong style="color:#ffffff;">1.</strong> Escolha um ativo (ex.: EUR/USD ou Bitcoin)')
               + p('<strong style="color:#ffffff;">2.</strong> Defina o valor e o tempo da operação')
               + p('<strong style="color:#ffffff;">3.</strong> Preveja: o preço vai <span style="color:#1FD196;font-weight:bold;">subir</span> ou <span style="color:#F0435A;font-weight:bold;">cair</span>?')
               + p('Acertou? O lucro cai na conta na hora. Treine quantas vezes quiser na demo — ela é grátis e recarrega.'),
      ctaLabel:  'Praticar na demo',
      ctaUrl:    PLATFORM_URL,
    }),
  })
}

export async function emailFlowA3(userId: string) {
  await sendTransactional({
    kind: 'flow_a3', refId: userId, userId,
    subject: 'Da demo para o real em menos de 1 minuto',
    html: layout({
      preheader: 'Pix instantâneo, a partir de R$ 50, saque rápido.',
      title:     'Pronto para operar de verdade?',
      bodyHtml:  p('Sair da demo é mais rápido do que você imagina:')
               + p('⚡ <strong style="color:#ffffff;">Pix instantâneo</strong> — o saldo cai na hora<br>'
                 + '💵 A partir de <strong style="color:#ffffff;">R$ 50</strong><br>'
                 + '🔒 Saques processados com prioridade')
               + p('E o melhor: seu primeiro depósito ainda vale <strong style="color:#ffffff;">bônus de 100% até R$ 300</strong>.'),
      ctaLabel:  'Fazer meu primeiro depósito',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Bônus liberado para saque após volume de operações de 20× o valor do bônus.',
    }),
  })
}

export async function emailFlowA4(userId: string) {
  await sendTransactional({
    kind: 'flow_a4', refId: userId, userId,
    subject: 'Dobre seu primeiro depósito — bônus de 100% até R$ 300',
    html: layout({
      preheader: 'Deposite R$ 100 e opere com R$ 200. Oferta do primeiro depósito.',
      title:     'Seu bônus de 100% está esperando 🎁',
      bodyHtml:  p(`Essa é a melhor oferta que você vai ver por aqui: no seu <strong style="color:#ffffff;">primeiro depósito</strong>, a ${BRAND_SHORT} dobra seu saldo.`)
               + highlight('Deposite R$ 100 → opere com', 'R$ 200')
               + p('Vale para qualquer valor a partir de R$ 50, com bônus de até R$ 300. Pix instantâneo: depositou, caiu, operou.'),
      ctaLabel:  'Ativar meu bônus de 100%',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Bônus creditado automaticamente no 1º depósito confirmado. Liberado para saque após volume de operações de 20× o valor do bônus — seu próprio saldo nunca fica preso.',
    }),
  })
}

export async function emailFlowB1(args: { userId: string; depositId: string; amount: number | string }) {
  await sendTransactional({
    kind: 'flow_b1', refId: args.depositId, userId: args.userId,
    subject: 'Seu Pix está esperando — finalize seu depósito',
    html: layout({
      preheader: 'Falta só pagar o Pix para o saldo cair na sua conta.',
      title:     'Falta pouco! Seu depósito não foi concluído',
      bodyHtml:  p(`Você gerou um Pix de <strong style="color:#ffffff;">${fmtBRL(args.amount)}</strong> mas o pagamento ainda não chegou.`)
               + p('O QR Code pode ter expirado — sem problema: entre na plataforma e gere outro em 1 clique. O saldo cai na hora.'),
      ctaLabel:  'Concluir meu depósito',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Se você já pagou, pode ignorar este e-mail — a confirmação pode levar alguns minutos.',
    }),
  })
}

export async function emailFlowB2(args: { userId: string; depositId: string; amount: number | string }) {
  await sendTransactional({
    kind: 'flow_b2', refId: args.depositId, userId: args.userId,
    subject: 'Última lembrança: seu depósito não foi concluído',
    html: layout({
      preheader: 'Seu saldo está a um Pix de distância.',
      title:     'Seu saldo está a um Pix de distância',
      bodyHtml:  p(`O depósito de <strong style="color:#ffffff;">${fmtBRL(args.amount)}</strong> que você começou continua pendente.`)
               + p('Depósitos via Pix caem na conta <strong style="color:#ffffff;">na hora</strong>, e seu primeiro depósito ainda vale <strong style="color:#ffffff;">bônus de 100% até R$ 300</strong>.'),
      ctaLabel:  'Gerar novo Pix',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Precisa de ajuda com o pagamento? Fale com o suporte pela plataforma — respondemos rápido.',
    }),
  })
}

export async function emailKycRejected(args: { userId: string; submissionId: string; reason?: string | null }) {
  const reason = args.reason?.trim()
  await sendTransactional({
    kind:    'kyc_rejected',
    refId:   args.submissionId,
    userId:  args.userId,
    subject: 'Sua verificação precisa de ajustes',
    html: layout({
      preheader: 'Sua verificação de identidade precisa de ajustes — veja o motivo.',
      title:     'Verificação não aprovada',
      bodyHtml:  p('Não foi possível aprovar sua verificação de identidade desta vez.')
               + (reason ? p(`<strong style="color:#ffffff;">Motivo:</strong> ${escapeHtml(reason)}`) : '')
               + p('Você pode reenviar os documentos corrigidos pela plataforma — a análise costuma ser rápida.'),
      ctaLabel:  'Reenviar documentos',
      ctaUrl:    PLATFORM_URL,
      footnote:  'Dica: fotos nítidas, sem reflexo e com o documento inteiro visível aceleram a aprovação.',
    }),
  })
}
