# Migrations (historicas)

Estas migrations foram criadas pelo Prisma quando o banco era o Postgres do EasyPanel.

A partir da Sessao 3 da migracao para Supabase (2026-05-26), o schema do banco
passou a ser gerenciado diretamente pelo Supabase (via MCP / Dashboard) — porque:

1. O Supabase pre-existe com 11 tabelas + 38 RPCs admin que nao vieram de Prisma
2. O Supabase Auth gerencia auth.users / auth.identities em schema proprio
3. Tentar aplicar estas migrations com `prisma migrate deploy` criaria tabelas
   duplicadas (`users` em vez de `profiles`) com tipos errados (cuid em vez de uuid)

Por isso, removemos `prisma migrate deploy` do `npm start` (ver package.json).
Estas migrations ficam aqui apenas como historico.

## Como evoluir o schema daqui pra frente

- Mudanca pequena (coluna nova, indice): usar `mcp__claude_ai_Supabase__apply_migration`
  pelo Claude, ou rodar SQL direto no Dashboard do Supabase
- Depois de aplicar a mudanca no DB: ajustar `apps/api/prisma/schema.prisma` para
  refletir a nova realidade e rodar `npx prisma generate`
- Nunca mais rodar `prisma migrate dev` ou `prisma migrate deploy` neste projeto
