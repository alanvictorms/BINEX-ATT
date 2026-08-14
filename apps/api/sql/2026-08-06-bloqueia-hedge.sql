-- APLICADO em producao 2026-08-06 via MCP.
-- Migrations: `bloqueia_hedge_de_rollover` + `place_trade_recusa_hedge`.
--
-- Bloqueia posicao travada: CALL e PUT simultaneos no mesmo par.

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE FOI OBSERVADO
--
-- Print do painel (06/08, 14:32): magdawanessa930, EUR/JPY (OTC), R$ 80 em cada
-- direcao, 1 segundo de diferenca, 1m de duracao. Uma perna +R$ 69,60, a outra
-- -R$ 80,00. Liquido -R$ 10,40 sobre R$ 160 de volume.
--
-- Medicao no historico: 35 pares travados desde 30/07, R$ 1.194 de volume de
-- rollover gerado a um custo total de R$ 86,26 — 7,2% do volume, SEM risco de
-- direcao. Convertia o rollover de 20x num pedagio fixo e previsivel.
-- (Segundo caso: elinaldosilvamartins9, 1 par, provavelmente acidental.)
--
-- JA ERA PROIBIDO pelo Regulamento de Bonus, secao de uso indevido:
--   "Operacoes simultaneas em direcoes opostas com o objetivo de cumprir rollover
--    sem assumir risco"
-- A regra existia desde sempre; faltava o sistema aplica-la.

-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE CONTROLAR O PRECO NAO RESOLVERIA
--
-- A pergunta que originou esta correcao foi "precisamos ter controle sobre CALL e
-- PUT". Nao resolve: posicao travada e NEUTRA EM DIRECAO. Preco subindo, o CALL
-- ganha e o PUT perde; preco caindo, o inverso. O resultado liquido e identico nos
-- dois cenarios. Nao existe movimento de preco que faca os dois lados perderem.
-- A unica defesa e impedir a segunda perna de abrir — que e o que esta aqui.

-- ─────────────────────────────────────────────────────────────────────────────
-- DETALHE QUE FAZ O BLOQUEIO FUNCIONAR: os dois formatos de asset_id
--
-- operations.asset_id tem duas formas pro mesmo par, e a cliente usava AS DUAS:
--   'eur-jpy-otc'                            slug, caminho Supabase (place_trade)
--   'c43e97c6-4334-4b21-9ede-4d6afef2c448'   uuid do OtcAsset, caminho Fastify
--
-- Bloqueio por asset_id literal seria contornado abrindo uma perna em cada caminho.
-- asset_match_key() canoniza os dois pro simbolo do backend:
--   asset_match_key('eur-jpy-otc')        = 'EURJPY-OTC'
--   asset_match_key('c43e97c6-...')       = 'EURJPY-OTC'   (via lookup em otc_assets)
--   asset_match_key('btc')                = 'btc'          (ativo LIVE, passa direto)
--
-- E o guard foi posto NAS DUAS ROTAS, chamando a MESMA funcao do Postgres
-- (opposite_open_leg), pra nao haver divergencia entre elas:
--   place_trade                                    (SQL, caminho Supabase)
--   apps/api/src/operations/service.ts:createOperation  (chama a funcao por raw query)

-- ─────────────────────────────────────────────────────────────────────────────
-- INDICE
--
-- A tabela operations NAO tinha indice em account_id nem status — so id,
-- created_at, booster_id e modified_by_admin. Sem indice, a checagem faria
-- sequential scan em 16k linhas a cada operacao aberta.
--
-- Indice parcial em status='OPEN' fica minusculo (quase toda linha e liquidada).
-- EXPLAIN ANALYZE apos aplicar: Index Scan, 0,949 ms, 7 buffers.
CREATE INDEX IF NOT EXISTS operations_open_by_account_idx
  ON public.operations (account_id, direction)
  WHERE status = 'OPEN';

-- ─────────────────────────────────────────────────────────────────────────────
-- ESCAPE HATCH
--
-- app_config.hedgeBlockEnabled (default true), editavel pelo painel — a chave foi
-- adicionada a allowlist do admin_set_config. Se um cliente legitimo for barrado,
-- da pra desligar sem migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- LIMITE CONHECIDO
--
-- Cobre direcoes opostas no MESMO par. Nao cobre hedge entre pares correlacionados
-- (ex.: EUR/USD CALL + USD/CHF PUT, que sao ~inversos). Detectar isso exige matriz
-- de correlacao e tem falso positivo alto — fica registrado como limite consciente.
-- O caso real observado era sempre o mesmo par.

-- Corpo completo das funcoes nas migrations. Verificacao rodada apos aplicar:
--   mesma direcao, mesmo ativo      -> NULL  (passa)
--   direcao oposta, mesmo ativo     -> 'BTCUSD-OTC'  (bloqueia)
--   direcao oposta, OUTRO ativo     -> NULL  (passa)
--   slug e uuid do mesmo par        -> mesma chave (nao ha como contornar trocando de rota)
