-- ─────────────────────────────────────────────────────────────────────────────
-- Detector de integridade das operacoes — 10/08/2026
--
-- POR QUE ISTO EXISTE
-- O bug da saida antecipada (80% em vez de 20%) rodou de 31/05 a 10/08 — 100
-- operacoes, R$ 17.408 — e so foi descoberto porque o founder achou uma coluna
-- estranha num print. Nenhum alarme tocou em dois meses e meio.
--
-- Numa opcao binaria o resultado so pode ser tres coisas: -100% da entrada,
-- +payout% da entrada, ou zero (empate). Qualquer outro numero e bug da casa.
-- Isso e verificavel por consulta, e teria pego o vazamento na primeira
-- operacao de maio.
--
-- EXCECOES LEGITIMAS que o detector precisa conhecer, senao vira alarme falso:
--   - saida antecipada  -> tem lancamento EARLY_CLOSE ligado a operacao;
--                          o resultado esperado passa a ser (refund - entrada),
--                          com refund limitado a 20% do stake
--   - edicao pelo admin -> modified_by_admin preenchido (admin_void_operation e
--                          admin_update_operation_status alteram resultado de
--                          proposito e ja deixam rastro proprio)
--   - centavo de arredondamento -> 11 vitorias historicas pagaram R$ 3,48 onde
--                          a conta da R$ 3,49 (floor vs round). Tolerancia de
--                          R$ 0,01 pra nao poluir o alerta com isso.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) A visao: a regra, legivel, consultavel a qualquer momento ─────────────
CREATE OR REPLACE VIEW public.operation_integrity_anomalies AS
WITH ec AS (
  SELECT operation_id, SUM(amount) AS refund
  FROM public.transactions
  WHERE type = 'EARLY_CLOSE' AND operation_id IS NOT NULL
  GROUP BY operation_id
)
SELECT
  o.id                AS operation_id,
  o.created_at,
  o.closed_at,
  a.user_id,
  a.type              AS conta,
  o.asset_symbol,
  o.amount,
  o.payout_pct,
  o.status,
  o.profit,
  x.motivo,
  x.impacto
FROM public.operations o
JOIN public.accounts a ON a.id = o.account_id
LEFT JOIN ec ON ec.operation_id = o.id
CROSS JOIN LATERAL (
  SELECT
    CASE
      -- Saida antecipada devolvendo acima do teto: foi ESTE o vazamento.
      WHEN ec.refund IS NOT NULL AND ec.refund > ROUND(o.amount * 0.20, 2) + 0.01
        THEN 'saida antecipada acima do teto de 20%'
      -- Extrato e operacao contando historias diferentes sobre o mesmo dinheiro.
      WHEN ec.refund IS NOT NULL AND abs(o.profit - (ec.refund - o.amount)) > 0.01
        THEN 'saida antecipada: extrato nao bate com a operacao'
      -- Operacao vencida que ninguem liquidou: familia da "opcao gratis".
      -- Sweeper tem grace de 2min; 15min ja e anomalia de verdade.
      WHEN o.status = 'OPEN' AND o.expires_at < now() - interval '15 minutes'
        THEN 'operacao vencida ha mais de 15min e nao liquidada'
      WHEN ec.refund IS NULL AND o.modified_by_admin IS NULL AND o.status = 'WON'
           AND abs(o.profit - ROUND(o.amount * o.payout_pct / 100, 2)) > 0.01
        THEN 'vitoria fora do payout contratado'
      WHEN ec.refund IS NULL AND o.modified_by_admin IS NULL AND o.status = 'LOST'
           AND abs(o.profit + o.amount) > 0.01
        THEN 'derrota que nao debitou a entrada inteira'
      WHEN ec.refund IS NULL AND o.modified_by_admin IS NULL AND o.status = 'DRAW'
           AND abs(o.profit) > 0.01
        THEN 'empate com lucro'
    END AS motivo,
    -- Quanto a casa deixou na mesa nesta operacao (positivo = prejuizo nosso).
    CASE
      WHEN ec.refund IS NOT NULL
        THEN ec.refund - LEAST(ec.refund, ROUND(o.amount * 0.20, 2))
      WHEN o.status = 'OPEN' THEN o.amount
      WHEN o.status = 'WON'  THEN o.profit - ROUND(o.amount * o.payout_pct / 100, 2)
      WHEN o.status = 'LOST' THEN o.profit + o.amount
      ELSE abs(o.profit)
    END AS impacto
) x
WHERE x.motivo IS NOT NULL;

COMMENT ON VIEW public.operation_integrity_anomalies IS
  'Operacoes cujo resultado financeiro nao fecha com a regra do produto. Ver 2026-08-10-detector-integridade.sql.';

-- A view roda com os direitos do dono e enxerga a tabela inteira: ninguem
-- alem do service_role pode chegar nela pelo PostgREST.
REVOKE ALL ON public.operation_integrity_anomalies FROM PUBLIC, anon, authenticated;

-- ── 2) O historico de alertas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integrity_alerts (
  id           bigserial PRIMARY KEY,
  operation_id uuid        NOT NULL,
  motivo       text        NOT NULL,
  impacto      numeric,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  ack_at       timestamptz,
  ack_by       uuid,
  UNIQUE (operation_id, motivo)
);

ALTER TABLE public.integrity_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integrity_alerts FROM PUBLIC, anon, authenticated;

-- ── 3) A varredura ───────────────────────────────────────────────────────────
-- Roda sobre uma janela (o cron usa 24h) e grava so o que ainda nao viu.
-- O UNIQUE segura a reincidencia: uma operacao anomala nao vira 96 alertas por
-- dia so porque o cron passou 96 vezes por cima dela.
CREATE OR REPLACE FUNCTION public.run_integrity_scan(p_janela interval DEFAULT interval '24 hours')
 RETURNS TABLE (novos int, impacto_novo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  WITH inseridos AS (
    INSERT INTO public.integrity_alerts (operation_id, motivo, impacto)
    SELECT v.operation_id, v.motivo, v.impacto
    FROM public.operation_integrity_anomalies v
    WHERE v.created_at > now() - p_janela
    ON CONFLICT (operation_id, motivo) DO NOTHING
    RETURNING impacto
  )
  SELECT COUNT(*)::int, COALESCE(ROUND(SUM(impacto), 2), 0) FROM inseridos;
END;
$function$;

REVOKE ALL ON FUNCTION public.run_integrity_scan(interval) FROM PUBLIC, anon, authenticated;

-- ── 4) Leitura pelo painel admin ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_integrity_alerts(p_only_open boolean DEFAULT true)
 RETURNS TABLE (
   id bigint, operation_id uuid, motivo text, impacto numeric,
   detected_at timestamptz, email text, conta text, asset_symbol text,
   amount numeric, status text, profit numeric
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  RETURN QUERY
  SELECT ia.id, ia.operation_id, ia.motivo, ia.impacto, ia.detected_at,
         u.email::text, a.type, o.asset_symbol, o.amount, o.status, o.profit
  FROM public.integrity_alerts ia
  JOIN public.operations o ON o.id = ia.operation_id
  JOIN public.accounts   a ON a.id = o.account_id
  JOIN auth.users        u ON u.id = a.user_id
  WHERE (NOT p_only_open) OR ia.ack_at IS NULL
  ORDER BY ia.detected_at DESC, ia.impacto DESC NULLS LAST;
END;
$function$;

-- ── 5) O relogio ─────────────────────────────────────────────────────────────
-- 15 em 15 minutos. Nao e exagero: operacao orfa e dinheiro saindo AGORA, e a
-- janela de 24h sobre 120 operacoes/dia custa quase nada.
SELECT cron.unschedule('integrity-scan')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'integrity-scan');

SELECT cron.schedule(
  'integrity-scan',
  '*/15 * * * *',
  $cron$SELECT public.run_integrity_scan(interval '24 hours')$cron$
);
