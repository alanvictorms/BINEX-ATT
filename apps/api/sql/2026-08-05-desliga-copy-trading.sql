-- APLICADO em producao 2026-08-05 via MCP. Migration: `desliga_copy_trading`.
--
-- Recomendacao da auditoria de 22/07 ("desligar copyTradeEnabled ja"), executada 15
-- dias depois na varredura de 05/08 — o modulo seguia ligado e gerando ciclos.

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE A CHAVE DESLIGA (e o que ela NAO desliga)
--
--   worker.ts:62-65  -> PARA a geracao de novos ciclos. Eram 21 assinaturas ACTIVE
--                       com next_cycle_at agendado.
--   routes.ts:31     -> PARA novas assinaturas (403 COPY_DISABLED).
--   routes.ts:15     -> ESVAZIA o catalogo ({ enabled:false, traders:[] }).
--
--   worker.ts (passo 1) -> a LIQUIDACAO continua rodando, de proposito: esta FORA do
--                       if (isCopyEnabled()). As 10 operacoes PENDING (R$ 90,72) vao
--                       liquidar normalmente. Nenhum saldo fica preso.
--   routes.ts:23     -> /copy/my segue respondendo, entao o cliente continua vendo
--                       historico e posicoes. Ninguem perde acesso ao que ja tem.
--
-- Ou seja: e um kill switch de ENTRADA, nao de SAIDA. Mesmo desenho da liquidez OTC.

-- ─────────────────────────────────────────────────────────────────────────────
-- OS NUMEROS QUE JUSTIFICARAM (05/08, copy_trade_operations status=SETTLED)
--
--   WIN    365 ops   volume R$ 54.626,29   cliente  +R$ 54.626,29   (payout 1:1)
--   LOSS   547 ops   volume R$ 81.176,34   cliente  -R$ 81.115,74
--   -----------------------------------------------------------------
--   taxa de acerto 40,0% com payout 1:1 -> empate tecnico seria 50%
--   => 20% de margem por ciclo. O OTC, que e o produto legitimo, faz 8,24%.
--
--   13 clientes giraram R$ 135.802 de volume. A plataforma INTEIRA recebeu R$ 5.257
--   em depositos confirmados. E o mesmo dinheiro — inflado pelo bonus escalonado —
--   rodando em ciclo, o que tambem explica a parede de rollover no saque.
--
--   35 das 56 assinaturas ja tinham sido canceladas pelos proprios clientes.
--
-- NOTA sobre a auditoria de 22/07: ela classificou o modulo como "money printer"
-- a favor do CLIENTE (op#1 sempre WIN, cancelCopy sem reembolso, assimetria
-- WIN integral / LOSS clampada). Os dados de 05/08 mostram o oposto no agregado —
-- o cliente perde 20% do volume por ciclo. As duas coisas podem coexistir (a
-- vantagem da op#1 existe e e engolida pelo resto do ciclo), mas a conclusao
-- pratica muda: o problema nao era a casa perder dinheiro, era o desenho do produto.
-- Retrabalho (escrow do ciclo) antes de religar.

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSIVEL: Admin -> Configuracoes -> Copy Trading, ou este UPDATE com 'true'.
UPDATE public.app_config
   SET value = 'false'::jsonb, updated_at = now()
 WHERE key = 'copyTradeEnabled';

-- VERIFICACAO (rodada apos aplicar):
--   copyTradeEnabled = false
--   operacoes copiadas criadas nos 10 minutos seguintes = 0
