# BINEX BROKER — Deploy no Emergent

## Problema original
Clonar e rodar a aplicação BINEX BROKER (https://github.com/alanvictorms/BINEX-COMPLETA.git) sem alterações no código.

## Arquitetura
- **Redis** (supervisor) → `redis://localhost:6379`
- **Fastify API** (supervisor, porta 3001) → `/app/apps/api/dist/main.js` (Prisma + Supabase)
- **FastAPI Proxy** (supervisor, porta 8001) → proxy reverso:
  - `/api/be/*` → Fastify (3001)
  - tudo o resto → Next.js (3000)
- **Next.js Frontend** (supervisor, porta 3000) → `/app/frontend`

## Implementado (14/08/2026)
- [x] Repo clonado e estrutura montada
- [x] Fastify API compilada (TypeScript → dist/)
- [x] Next.js build (standalone) concluído
- [x] Redis rodando
- [x] Proxy reverso FastAPI funcionando
- [x] Health check: `GET /api/be/health` → 200 OK
- [x] Frontend carregando: `/`, `/login` → 200

## Pendências (P0 — usuário precisa configurar)
- Supabase credentials em `/app/frontend/.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Database em `/app/apps/api/.env`:
  - `DATABASE_URL` (Supabase PostgreSQL pooler)
  - `SUPABASE_URL`
- Após atualizar .env: `sudo supervisorctl restart frontend api`
- Rebuild frontend após mudar NEXT_PUBLIC_*: `cd /app/frontend && yarn build && sudo supervisorctl restart frontend`

## Backlog P1/P2
- BSPay credentials (depósito/saque PIX)
- TWELVE_DATA_API_KEY / FINNHUB (market data)
- Sentry auth token
- OTC Engine (atualmente disabled via OTC_ENGINE_ENABLED=false)
