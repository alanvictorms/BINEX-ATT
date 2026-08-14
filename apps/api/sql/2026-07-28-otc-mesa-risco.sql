-- OTC — Mesa de risco (Bloco 2) + trava anti-direcionamento.
-- Aplicado em producao (Supabase yilmbwrfaljxgvsygmyz) 2026-07-28 via MCP.
--
-- CONTEXTO: o painel de referencia misturava tres coisas — ativo sintetico (Bloco 1),
-- monitoramento de risco (Bloco 2) e direcionamento de resultado nos 30s finais da
-- vela (Bloco 3). Aqui vai so o Bloco 2. O Bloco 3 nao sera construido.
--
-- GOTCHA CENTRAL: operations.asset_id guarda DOIS formatos para o mesmo par —
--   slug  'eur-usd-otc'                 (caminho Supabase / place_trade)
--   cuid  'cmpk3lv4700011lu492g74cim5'  (caminho API Fastify, ~86% do volume)
-- Ambos sao legitimos e precificados no servidor. Toda consulta da mesa precisa
-- casar pelos dois, senao a maior parte do volume some do painel.
--
-- live_prices e sempre chaveada por SLUG, entao o preco e buscado convertendo o
-- slug para symbol (mesma expressao que o place_trade usa).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Historico de mudanca de parametro (qualquer caminho de escrita)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otc_param_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    text NOT NULL,
  symbol      text NOT NULL,
  changed_by  uuid,                 -- auth.uid() quando vem do Supabase; NULL via Fastify/service-role
  field       text NOT NULL,        -- 'trend' | 'volatility' | 'base_price' | 'payout' | 'status'
  old_value   text,
  new_value   text,
  open_ops    int  NOT NULL DEFAULT 0,   -- quantas posicoes estavam abertas na hora
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otc_param_log_asset_idx ON public.otc_param_log (asset_id, created_at DESC);
ALTER TABLE public.otc_param_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otc_param_log FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Quantas posicoes abertas existem num par OTC (cobre os dois formatos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.otc_open_positions(p_asset_id text, p_symbol text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
  SELECT COALESCE(count(*), 0)::int
  FROM public.operations o
  JOIN public.accounts a ON a.id = o.account_id
  WHERE o.status = 'OPEN'
    AND a.type = 'REAL'
    AND (
      o.asset_id = p_asset_id
      OR upper(replace(replace(o.asset_id, '-otc', ''), '-', '')) || '-OTC' = p_symbol
    );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) TRAVA: parametro direcional nao muda com posicao aberta.
--
--    Dois campos movem o preco numa direcao:
--      trend      -> driftBias = trend * volatility * price   (rng.ts:52)
--      base_price -> reversion = (basePrice - price) * 0.001  (rng.ts:54)
--    Mexer neles com posicao aberta e direcionar resultado. O trigger fecha isso
--    para TODO caminho de escrita — Supabase RPC, API Fastify e SQL manual.
--
--    volatility nao tem direcao (aumenta variancia dos dois lados), entao e so
--    registrada, nao bloqueada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.otc_assets_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_open int;
BEGIN
  v_open := public.otc_open_positions(NEW.id, NEW.symbol);

  IF NEW.trend IS DISTINCT FROM OLD.trend AND v_open > 0 THEN
    RAISE EXCEPTION 'OTC_DIRECTIONAL_LOCKED: % tem % posição(ões) aberta(s). O trend não pode ser alterado enquanto houver posição aberta — isso moveria o preço contra quem já está operando. Espere as operações fecharem.', NEW.symbol, v_open;
  END IF;

  IF NEW.base_price IS DISTINCT FROM OLD.base_price AND v_open > 0 THEN
    RAISE EXCEPTION 'OTC_DIRECTIONAL_LOCKED: % tem % posição(ões) aberta(s). O preço base puxa o preço por mean-reversion, então também não pode mudar com posição aberta.', NEW.symbol, v_open;
  END IF;

  -- Registro de tudo que muda, venha de onde vier.
  IF NEW.trend      IS DISTINCT FROM OLD.trend THEN
    INSERT INTO public.otc_param_log (asset_id, symbol, changed_by, field, old_value, new_value, open_ops)
    VALUES (NEW.id, NEW.symbol, auth.uid(), 'trend', OLD.trend::text, NEW.trend::text, v_open);
  END IF;
  IF NEW.volatility IS DISTINCT FROM OLD.volatility THEN
    INSERT INTO public.otc_param_log (asset_id, symbol, changed_by, field, old_value, new_value, open_ops)
    VALUES (NEW.id, NEW.symbol, auth.uid(), 'volatility', OLD.volatility::text, NEW.volatility::text, v_open);
  END IF;
  IF NEW.base_price IS DISTINCT FROM OLD.base_price THEN
    INSERT INTO public.otc_param_log (asset_id, symbol, changed_by, field, old_value, new_value, open_ops)
    VALUES (NEW.id, NEW.symbol, auth.uid(), 'base_price', OLD.base_price::text, NEW.base_price::text, v_open);
  END IF;
  IF NEW.payout     IS DISTINCT FROM OLD.payout THEN
    INSERT INTO public.otc_param_log (asset_id, symbol, changed_by, field, old_value, new_value, open_ops)
    VALUES (NEW.id, NEW.symbol, auth.uid(), 'payout', OLD.payout::text, NEW.payout::text, v_open);
  END IF;
  IF NEW.status     IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.otc_param_log (asset_id, symbol, changed_by, field, old_value, new_value, open_ops)
    VALUES (NEW.id, NEW.symbol, auth.uid(), 'status', OLD.status::text, NEW.status::text, v_open);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS otc_assets_guard_trg ON public.otc_assets;
CREATE TRIGGER otc_assets_guard_trg
  BEFORE UPDATE ON public.otc_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.otc_assets_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) A mesa: exposicao ao vivo por par
--
--    net_if_call = o que a casa embolsa se as CALLs vencerem
--                = soma das PUTs (perdidas) - soma das CALLs x payout
--    net_if_put  = espelho
--
--    Numero negativo = aquele lado te custa dinheiro. Serve para desligar o par,
--    baixar teto de entrada ou ajustar payout — NUNCA para mover o preco.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_otc_risk_desk()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  RETURN jsonb_build_object(
    'server_time',      now(),
    'candle_ends_in',   60 - (extract(epoch FROM now())::bigint % 60),
    'rows', COALESCE((
      SELECT jsonb_agg(r ORDER BY (r->>'exposure')::numeric DESC, r->>'symbol')
      FROM (
        SELECT jsonb_build_object(
          'id',         oa.id,
          'symbol',     oa.symbol,
          'name',       oa.name,
          'status',     oa.status::text,
          'payout',     oa.payout,
          'volatility', oa.volatility,
          'trend',      oa.trend,
          'decimals',   oa.decimals,
          'price',      lp.price,
          -- idade do tick: se subir muito, o motor OTC parou
          'price_age_s', CASE WHEN lp.updated_at IS NULL THEN NULL
                              ELSE round(extract(epoch FROM (now() - lp.updated_at))::numeric, 1) END,
          'open_calls',  COALESCE(x.calls_n, 0),
          'open_puts',   COALESCE(x.puts_n, 0),
          'amount_call', COALESCE(x.calls_amt, 0),
          'amount_put',  COALESCE(x.puts_amt, 0),
          'traders',     COALESCE(x.traders, 0),
          'exposure',    COALESCE(x.calls_amt, 0) + COALESCE(x.puts_amt, 0),
          -- resultado da casa em cada cenario
          'net_if_call', COALESCE(x.puts_amt, 0)  - COALESCE(x.calls_amt, 0) * oa.payout / 100.0,
          'net_if_put',  COALESCE(x.calls_amt, 0) - COALESCE(x.puts_amt, 0)  * oa.payout / 100.0,
          -- trava: com posicao aberta, trend/base_price ficam bloqueados
          'params_locked', COALESCE(x.calls_n, 0) + COALESCE(x.puts_n, 0) > 0
        ) AS r
        FROM public.otc_assets oa
        LEFT JOIN LATERAL (
          SELECT lp2.price, lp2.updated_at
          FROM public.live_prices lp2
          WHERE upper(replace(replace(lp2.asset_id, '-otc', ''), '-', '')) || '-OTC' = oa.symbol
          LIMIT 1
        ) lp ON true
        LEFT JOIN LATERAL (
          SELECT
            count(*) FILTER (WHERE o.direction = 'CALL')                  AS calls_n,
            count(*) FILTER (WHERE o.direction = 'PUT')                   AS puts_n,
            COALESCE(sum(o.amount) FILTER (WHERE o.direction = 'CALL'),0) AS calls_amt,
            COALESCE(sum(o.amount) FILTER (WHERE o.direction = 'PUT'),0)  AS puts_amt,
            count(DISTINCT a.user_id)                                     AS traders
          FROM public.operations o
          JOIN public.accounts a ON a.id = o.account_id
          JOIN public.profiles p ON p.id = a.user_id
          WHERE o.status = 'OPEN'
            AND a.type = 'REAL'
            AND NOT COALESCE(p.is_internal, false)   -- contas de demonstracao fora da metrica
            AND (
              o.asset_id = oa.id
              OR upper(replace(replace(o.asset_id, '-otc', ''), '-', '')) || '-OTC' = oa.symbol
            )
        ) x ON true
      ) s
    ), '[]'::jsonb)
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Liquidez por par — kill switch granular
--
--    ATENCAO: hoje isto so tira o par do motor de precos (o engine carrega
--    WHERE status='ACTIVE'). O place_trade NAO checa otc_assets.status, entao a
--    abertura de operacao so passa a falhar quando o preco envelhece (>120s), com
--    erro PRICE_UNAVAILABLE. Kill switch imediato exige uma linha no place_trade —
--    fica para a Etapa 3, junto com o resto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_otc_liquidity(p_id text, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE v_before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT to_jsonb(oa) INTO v_before FROM public.otc_assets oa WHERE oa.id = p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Ativo OTC não encontrado'; END IF;

  UPDATE public.otc_assets
     SET status = (CASE WHEN p_active THEN 'ACTIVE' ELSE 'INACTIVE' END)::otc_asset_status,
         updated_at = now()
   WHERE id = p_id;

  PERFORM public.log_admin_action(
    CASE WHEN p_active THEN 'otc_liquidity_on' ELSE 'otc_liquidity_off' END,
    'otc_asset', NULL, v_before,
    (SELECT to_jsonb(oa) FROM public.otc_assets oa WHERE oa.id = p_id), NULL);
END;
$function$;

-- Volatilidade: sem direcao, entao pode mudar a qualquer momento — mas fica logada.
CREATE OR REPLACE FUNCTION public.admin_set_otc_volatility(p_id text, p_volatility numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_volatility IS NULL OR p_volatility <= 0 OR p_volatility > 0.1 THEN
    RAISE EXCEPTION 'Volatilidade fora da faixa (0 a 0.1)';
  END IF;

  UPDATE public.otc_assets SET volatility = p_volatility, updated_at = now() WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ativo OTC não encontrado'; END IF;
END;
$function$;

-- Historico de parametros, para a aba de auditoria da mesa.
CREATE OR REPLACE FUNCTION public.admin_otc_param_log(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'symbol', l.symbol, 'field', l.field,
      'old_value', l.old_value, 'new_value', l.new_value,
      'open_ops', l.open_ops, 'created_at', l.created_at,
      'changed_by', COALESCE(p.name, 'API/servidor')
    ) ORDER BY l.created_at DESC)
    FROM (SELECT * FROM public.otc_param_log ORDER BY created_at DESC LIMIT COALESCE(p_limit,50)) l
    LEFT JOIN public.profiles p ON p.id = l.changed_by
  ), '[]'::jsonb);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Permissoes
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_otc_risk_desk()                    FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_otc_param_log(int)                 FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_otc_liquidity(text, boolean)   FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_otc_volatility(text, numeric)  FROM public, anon;
REVOKE ALL ON FUNCTION public.otc_open_positions(text, text)           FROM public, anon;

GRANT EXECUTE ON FUNCTION public.admin_otc_risk_desk()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_otc_param_log(int)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_otc_liquidity(text, boolean)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_otc_volatility(text, numeric) TO authenticated;
