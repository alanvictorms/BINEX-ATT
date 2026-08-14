/**
 * Exporta as definicoes vivas das RPCs do Supabase para apps/api/sql/.
 *
 * SOMENTE LEITURA: roda pg_get_functiondef() sobre pg_proc — nao altera nada.
 * Motivo: settle_trade / early_close_trade / is_forex_open_now (e a versao viva
 * de place_trade) so existiam no Supabase, fora do repositorio. Antes de mexer
 * na liquidacao, versionamos o que esta em producao.
 *
 * Uso:
 *   npx tsx scripts/export-rpc-definitions.ts            # grava o snapshot em sql/
 *   npx tsx scripts/export-rpc-definitions.ts --stdout   # so imprime, nao grava
 */
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Grupos de RPCs exportaveis. Selecione com --group=<nome> (default: settlement).
const GROUPS: Record<string, { functions: string[]; outFile: string }> = {
  settlement: {
    functions: ['settle_trade', 'early_close_trade', 'is_forex_open_now', 'place_trade'],
    outFile:   '2026-07-09-rpc-snapshot-live-settlement.sql',
  },
  bonus: {
    functions: [
      'grant_first_deposit_bonus', 'confirm_deposit', 'admin_confirm_deposit_manually',
      'sync_bonus_rollover', 'request_withdrawal', 'admin_revoke_bonus',
      'admin_set_config', 'get_public_config',
    ],
    outFile:   '2026-07-09-rpc-snapshot-bonus-deposit.sql',
  },
}

const groupArg = process.argv.find(a => a.startsWith('--group='))?.slice(8) ?? 'settlement'
const group = GROUPS[groupArg]
if (!group) { console.error(`grupo desconhecido: ${groupArg} (use: ${Object.keys(GROUPS).join(', ')})`); process.exit(1) }

const FUNCTIONS = group.functions
const OUT_FILE  = group.outFile

interface FnRow {
  proname:  string
  args:     string
  def:      string
}

async function main() {
  const { prisma } = await import('../src/prisma.js')

  const rows = await prisma.$queryRaw<FnRow[]>`
    SELECT p.proname                                  AS proname,
           pg_get_function_identity_arguments(p.oid)  AS args,
           pg_get_functiondef(p.oid)                  AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(${FUNCTIONS})
    ORDER BY p.proname, args
  `

  const found   = new Set(rows.map(r => r.proname))
  const missing = FUNCTIONS.filter(f => !found.has(f))

  const header = [
    '-- Snapshot das RPCs vivas no Supabase (producao) — exportado em 2026-07-09',
    '-- Gerado por: apps/api/scripts/export-rpc-definitions.ts (pg_get_functiondef).',
    '--',
    '-- Este arquivo e REGISTRO do que esta em producao, nao migration executavel',
    '-- (as functions ja existem no banco). Se editar uma delas, atualize este',
    '-- snapshot rodando o script de novo.',
    '--',
    '-- IMPORTANTE: NAO aplicar o REVOKE da "Parte B" de 2026-05-28-harden-operations.sql',
    '-- enquanto o navegador depender de settle_trade/early_close_trade — o fluxo do',
    '-- cliente (TradingPanel) chama essas RPCs diretamente.',
    missing.length ? `--\n-- ATENCAO: nao encontradas no banco: ${missing.join(', ')}` : '',
    '',
  ].filter(Boolean).join('\n')

  const body = rows
    .map(r => `-- ─── ${r.proname}(${r.args}) ${'─'.repeat(Math.max(3, 60 - r.proname.length))}\n\n${r.def.trim()};\n`)
    .join('\n')

  const content = header + '\n' + body

  if (process.argv.includes('--stdout')) {
    console.log(content)
  } else {
    const here = dirname(fileURLToPath(import.meta.url))
    const out  = resolve(here, '..', 'sql', OUT_FILE)
    writeFileSync(out, content, 'utf8')
    console.log(`✅ ${rows.length} definicoes exportadas para apps/api/sql/${OUT_FILE}`)
    for (const r of rows) console.log(`   - ${r.proname}(${r.args})`)
    if (missing.length) console.log(`⚠️  nao encontradas: ${missing.join(', ')}`)
  }

  await prisma.$disconnect()
}

main().catch(err => { console.error('❌', err?.message ?? err); process.exit(1) })
