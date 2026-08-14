-- APLICADO em producao 2026-08-05 via MCP.
-- Migration: `operations_amount_positive_e_janela_preco`
--
-- Duas coisas que apareceram verificando o deploy do controle de preco OTC.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) A constraint do "URGENTE" de 31/07 NUNCA TINHA SIDO APLICADA
--
--    apps/api/sql/2026-07-31-URGENTE-place-trade-amount-positivo.sql estava no
--    repositorio com o passo 2 escrito, e `operations_amount_positive` nao existia
--    no banco. Cinco dias acreditando que o buraco estava fechado.
--
--    O BURACO: place_trade nao validava p_amount > 0.
--      IF v_balance < p_amount                           -- 0 < -100000 = falso, passa
--      UPDATE accounts SET balance = balance - p_amount   -- balance + 100000
--    Chamavel do console do navegador por qualquer usuario logado, com a anon key
--    publica, em conta REAL.
--
--    NAO FOI EXPLORADO: `SELECT count(*) FROM operations WHERE amount <= 0` = 0.
--
--    Ja estava fechado no nivel da funcao desde 05/08 — o INVALID_AMOUNT que entrou
--    junto com a sessao OTC (2026-08-05-otc-controle-preco.sql, bloco 5) recusa antes
--    de tocar em saldo. Esta constraint e a rede: defesa na tabela sobrevive a
--    reescrita de funcao, que foi o argumento do arquivo de 31/07.
--
--    Tabela com 16.279 linhas / 5,4 MB e ZERO violacoes, entao validada de uma vez
--    (o arquivo original previa NOT VALID porque nao sabia se havia linha ruim).
ALTER TABLE public.operations
  ADD CONSTRAINT operations_amount_positive CHECK (amount > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Janela de preco velho: 90s -> 20s
--
--    place_trade: v_max_age := LEAST(GREATEST(duracao_s, 45), priceMaxAgeCapSec)
--    Com o teto em 90, uma opcao de 60 SEGUNDOS podia ser aberta com preco de 90
--    segundos atras. Em ativo real (Kraken/Binance) isso e dinheiro na mesa pra quem
--    acompanha o mercado de verdade em outra aba: entra sabendo a direcao.
--
--    O NUMERO QUE MOTIVOU (05/08, conta REAL, contas internas fora):
--      ativos reais    8.492 ops  cliente acerta 53,9%  empate tecnico 53,89%  -R$ 825
--      OTC sintetico   1.734 ops  cliente acerta 51,6%  empate tecnico 53,61%  +R$ 2.998
--    Ou seja: o motor sintetico da margem; os ativos reais estao no zero exato. E o
--    prejuizo e concentrado — uma conta com 64,2% de acerto em 67 operacoes responde
--    por -R$ 1.400, mais que o prejuizo total.
--
--    POR QUE 20s E SEGURO: medicao em producao no momento da mudanca — os 21 ativos
--    de live_prices com idade <= 4,9s (OTC publica a cada 2s, cripto e forex a cada
--    5s). 20s cobre duas publicacoes perdidas seguidas. O comentario de 28/07 que
--    falava em "13-16s" esta desatualizado.
--
--    REVERSIVEL NA HORA pelo painel (Admin -> Configuracoes), sem deploy, se aparecer
--    PRICE_UNAVAILABLE em operacao legitima.
UPDATE public.app_config
   SET value = '20'::jsonb, updated_at = now()
 WHERE key = 'priceMaxAgeCapSec';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACAO (rodada apos aplicar)
--   operations_amount_positive | validada=true
--   priceMaxAgeCapSec = 20s
--   idade maxima em live_prices = 3,8s em 21 ativos
-- ─────────────────────────────────────────────────────────────────────────────
