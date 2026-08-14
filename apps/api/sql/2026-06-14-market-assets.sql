-- Admin / Ativos — DDL aplicado em produção (Supabase yilmbwrfaljxgvsygmyz) 2026-06-14.
-- Aplicado via Supabase MCP (apply_migration). Este arquivo e o REGISTRO do que foi rodado.
--
-- Tabela de ativos REAIS (forex/cripto) com payout autoritativo POR PAR, lido pelo
-- hot-path place_trade. OTC continua na otc_assets (intacto). Salvaguarda no place_trade:
-- se o ativo real NAO estiver na tabela, mantem o teto 92 (sem regressao). place_trade
-- tambem passa a respeitar o modo manutencao (app_config.maintenanceMode).
--
-- Frontend: apps/web/src/lib/marketAssets.ts sincroniza payout/disponibilidade na UI;
-- apps/web/src/app/admin/ativos/page.tsx edita payout/status/ordem.

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.market_assets (
  id            text PRIMARY KEY,                 -- = asset_id (casa com operations/live_prices)
  symbol        text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL,                    -- 'forex' | 'crypto'
  source        text NOT NULL,                    -- 'twelvedata' | 'binance'
  payout        int  NOT NULL DEFAULT 90 CHECK (payout >= 0 AND payout <= 100),
  enabled       boolean NOT NULL DEFAULT true,
  decimals      int  NOT NULL DEFAULT 5,
  display_order int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS market_assets_public_read ON public.market_assets;
CREATE POLICY market_assets_public_read ON public.market_assets FOR SELECT USING (enabled = true);
GRANT SELECT ON public.market_assets TO anon, authenticated;

-- 2) Seed (REAL_ASSETS + payouts atuais do mockData). Nao sobrescreve se ja existir.
INSERT INTO public.market_assets (id, symbol, name, category, source, payout, decimals, display_order) VALUES
  ('eur-usd', 'EUR/USD', 'EUR/USD',  'forex',  'twelvedata', 92, 5, 1),
  ('gbp-usd', 'GBP/USD', 'GBP/USD',  'forex',  'twelvedata', 92, 5, 2),
  ('btc',     'BTC/USD', 'Bitcoin',  'crypto', 'binance',    88, 2, 3),
  ('eth',     'ETH/USD', 'Ethereum', 'crypto', 'binance',    88, 2, 4),
  ('sol',     'SOL/USD', 'Solana',   'crypto', 'binance',    85, 2, 5),
  ('xrp',     'XRP/USD', 'Ripple',   'crypto', 'binance',    85, 4, 6),
  ('bnb',     'BNB/USD', 'BNB',      'crypto', 'binance',    85, 2, 7)
ON CONFLICT (id) DO NOTHING;

-- 3) RPCs admin
CREATE OR REPLACE FUNCTION public.admin_list_market_assets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'symbol', symbol, 'name', name, 'category', category, 'source', source,
      'payout', payout, 'enabled', enabled, 'decimals', decimals,
      'display_order', display_order, 'updated_at', updated_at
    ) ORDER BY display_order, symbol)
    FROM public.market_assets
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_market_asset(
  p_id text, p_payout int, p_enabled boolean, p_display_order int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_payout IS NULL OR p_payout < 0 OR p_payout > 100 THEN
    RAISE EXCEPTION 'Payout inválido (0 a 100)';
  END IF;

  UPDATE public.market_assets
     SET payout        = p_payout,
         enabled       = COALESCE(p_enabled, enabled),
         display_order = COALESCE(p_display_order, display_order),
         updated_at    = now()
   WHERE id = p_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Ativo não encontrado'; END IF;

  PERFORM public.log_admin_action('update_market_asset', 'market_asset', NULL,
    NULL, jsonb_build_object('id', p_id, 'payout', p_payout, 'enabled', p_enabled), NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_market_assets()                        FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_update_market_asset(text,int,boolean,int)    FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_market_assets()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_market_asset(text,int,boolean,int) TO authenticated;

-- 4) place_trade: payout autoritativo de market_assets p/ ativos reais + bloqueio de
--    manutencao. OTC e todo o resto da logica permanecem identicos.
CREATE OR REPLACE FUNCTION public.place_trade(p_account_id uuid, p_asset_id text, p_asset_symbol text, p_direction text, p_amount numeric, p_payout_pct numeric, p_entry_price numeric, p_expires_at timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_balance     numeric;
  v_op_id       uuid;
  v_is_otc      boolean;
  v_is_crypto   boolean;
  v_price       numeric;
  v_age_s       numeric;
  v_max_age     numeric;
  v_otc_payout  numeric;
  v_auth_payout numeric;
  v_ma_payout   numeric;
  v_ma_enabled  boolean;
BEGIN
  -- Modo manutencao: bloqueia abertura de novas operacoes.
  IF COALESCE((SELECT (value #>> '{}')::boolean FROM public.app_config WHERE key='maintenanceMode'), false) THEN
    RAISE EXCEPTION 'MAINTENANCE: Plataforma em manutenção. Novas operações temporariamente indisponíveis.';
  END IF;

  v_is_otc    := p_asset_id ILIKE '%otc%';
  v_is_crypto := p_asset_id ~* '^(btc|eth|sol|bnb|xrp|ada|doge|dot|matic|avax|link|atom|ltc|trx|near|fil|uni|aave|sand|mana|shib|ape|crv|gala|sushi)';

  IF NOT v_is_otc AND NOT v_is_crypto THEN
    IF NOT public.is_forex_open_now() THEN
      RAISE EXCEPTION 'MARKET_CLOSED: O mercado deste ativo está fechado neste momento.';
    END IF;
  END IF;

  -- Payout autoritativo (anti-inflacao do cliente).
  IF v_is_otc THEN
    SELECT payout INTO v_otc_payout FROM public.otc_assets
     WHERE symbol = upper(replace(replace(p_asset_id, '-otc', ''), '-', '')) || '-OTC';
    v_auth_payout := LEAST(p_payout_pct, COALESCE(v_otc_payout, 92));
  ELSE
    -- Ativos reais (forex/cripto): payout autoritativo da tabela market_assets.
    SELECT payout, enabled INTO v_ma_payout, v_ma_enabled
      FROM public.market_assets WHERE id = p_asset_id;
    IF FOUND AND v_ma_enabled = false THEN
      RAISE EXCEPTION 'ASSET_DISABLED: Este ativo está temporariamente indisponível.';
    END IF;
    -- Sem linha na tabela => mantem o comportamento anterior (teto 92), sem regressao.
    v_auth_payout := LEAST(p_payout_pct, COALESCE(v_ma_payout, 92));
  END IF;
  IF v_auth_payout IS NULL OR v_auth_payout <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYOUT';
  END IF;

  v_max_age := CASE WHEN (NOT v_is_otc AND NOT v_is_crypto) THEN 300 ELSE 120 END;

  SELECT lp.price, extract(epoch FROM (now() - lp.updated_at))
    INTO v_price, v_age_s
  FROM public.live_prices lp
  WHERE lp.asset_id = p_asset_id;

  IF v_price IS NULL OR v_age_s > v_max_age THEN
    RAISE EXCEPTION 'PRICE_UNAVAILABLE';
  END IF;

  SELECT balance INTO v_balance
  FROM public.accounts
  WHERE id = p_account_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id;

  INSERT INTO public.operations
    (account_id, asset_id, asset_symbol, direction, amount, payout_pct,
     entry_price, entry_price_source, expires_at)
  VALUES
    (p_account_id, p_asset_id, p_asset_symbol, p_direction, p_amount, v_auth_payout,
     v_price, 'SERVER', p_expires_at)
  RETURNING id INTO v_op_id;

  INSERT INTO public.transactions (account_id, type, amount, description, operation_id)
  VALUES (p_account_id, 'TRADE_LOSS', -p_amount,
          'Operação aberta: ' || p_asset_symbol || ' ' || p_direction, v_op_id);

  RETURN json_build_object('id', v_op_id, 'entry_price', v_price);
END;
$function$;
