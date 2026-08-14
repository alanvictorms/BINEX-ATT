# BINEX BROKER — Deploy no Emergent

## Arquitetura
- Redis (supervisor) → redis://localhost:6379
- Fastify API (supervisor, porta 3001) → OTC Engine HABILITADO
- FastAPI Proxy (supervisor, porta 8001)
- Next.js Frontend (supervisor, porta 3000)

## Implementado (14/08/2026)
- [x] Aplicação completa rodando com Supabase
- [x] OTC Engine habilitado, Redis rodando
- [x] 5 páginas migradas para design system vx-* (CopyPanel, SupportPage, ContaPage, VerificacaoTab)
- [x] Landing page criativa com hero, live preview, depoimentos, FAQ
- [x] Asset Selector: removido "Atual", removido separador, favoritos em localStorage
- [x] Saldo 15px

## Testes: Backend 100%, Frontend 95%
