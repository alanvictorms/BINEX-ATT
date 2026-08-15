import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const file = process.argv[2]
if (!file) { console.error('uso: tsx prisma/_applysql.ts <arquivo.sql>'); process.exit(1) }

const prisma = new PrismaClient()

/**
 * Divide em statements por ';', mas ignorando os que estao dentro de um corpo
 * $tag$...$tag$ — senao o corpo da function e cortado no meio. Necessario
 * porque o pooler nao aceita multiplos comandos num prepared statement.
 */
function splitStatements(sql: string): string[] {
  const out: string[] = []
  let buf = ''
  let dollarTag: string | null = null
  let i = 0
  while (i < sql.length) {
    if (!dollarTag) {
      // Comentario de linha: pula ate o \n. Sem isto, um ';' dentro de um
      // comentario corta o statement no meio.
      if (sql.startsWith('--', i)) {
        const nl = sql.indexOf('\n', i)
        const end = nl === -1 ? sql.length : nl
        buf += sql.slice(i, end)
        i = end
        continue
      }
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
      if (m) { dollarTag = m[0]; buf += m[0]; i += m[0].length; continue }
      if (sql[i] === ';') { if (buf.trim()) out.push(buf.trim()); buf = ''; i++; continue }
    } else if (sql.startsWith(dollarTag, i)) {
      buf += dollarTag; i += dollarTag.length; dollarTag = null; continue
    }
    buf += sql[i]; i++
  }
  if (buf.trim()) out.push(buf.trim())
  // Descarta blocos que sobraram so com comentario.
  return out.filter(s => s.split('\n').some(l => l.trim() && !l.trim().startsWith('--')))
}

async function main() {
  const stmts = splitStatements(readFileSync(file, 'utf8'))
  console.log(`${stmts.length} statements em ${file}`)
  for (const [n, s] of stmts.entries()) {
    await prisma.$executeRawUnsafe(s)
    console.log(`  [${n + 1}/${stmts.length}] ok — ${s.split('\n')[0].slice(0, 70)}`)
  }
  const chk = await prisma.$queryRawUnsafe(`select key from app_config where key = 'derivEnabled'`) as any[]
  console.log('derivEnabled presente:', chk.length > 0)
}

main().catch(e => { console.error('FALHOU:', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
