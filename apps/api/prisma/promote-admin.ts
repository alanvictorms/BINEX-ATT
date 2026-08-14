import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

// Apos a migracao para Supabase Auth, admin nao eh mais uma coluna em users:
// existe uma tabela public.admin_users (FK p/ auth.users.id) onde existencia da linha = admin.
// Este script promove um usuario buscando-o por email diretamente em auth.users.
const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Uso: npm run db:promote-admin <email>')
    process.exit(1)
  }

  // Busca user_id em auth.users via raw query (Prisma nao modela o schema auth).
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM auth.users WHERE email = ${email} LIMIT 1
  `
  if (rows.length === 0) {
    console.error(`✗ Usuario ${email} nao encontrado em auth.users`)
    process.exit(1)
  }
  const userId = rows[0].id

  const admin = await prisma.adminUser.upsert({
    where:  { userId },
    update: { role: 'admin' },
    create: { userId, role: 'admin' },
  })
  console.log('✓ Promovido:', { email, userId, role: admin.role })
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
