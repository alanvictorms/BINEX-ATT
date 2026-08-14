# BINEX BROKER — Deploy no Emergent

## Problema original
Clonar e rodar a aplicação BINEX BROKER (https://github.com/alanvictorms/BINEX-COMPLETA.git) sem alterações no código.

## Arquitetura
- Redis (supervisor) → redis://localhost:6379
- Fastify API (supervisor, porta 3001) → /app/apps/api/dist/main.js
- FastAPI Proxy (supervisor, porta 8001) → proxy reverso
- Next.js Frontend (supervisor, porta 3000) → /app/frontend

## Implementado (14/08/2026)
- [x] Aplicação completa rodando
- [x] Credenciais Supabase configuradas
- [x] Migração de design: CopyPanel, SupportPage, ContaPage (Minha Conta + Retirada), VerificacaoTab
- [x] Nova landing page harmônica com design system de trade
- [x] Asset Selector: removido "Atual", removido separador "Forex", favoritos em localStorage, default vazio
- [x] Fonte do saldo alterada para 15px

## Pendências
- P1: BSPay credentials para PIX
- P1: OTC Engine (atualmente disabled)
- P2: TWELVE_DATA_API_KEY, Sentry
