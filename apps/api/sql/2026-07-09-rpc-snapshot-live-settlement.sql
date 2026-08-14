-- Snapshot das RPCs vivas no Supabase (producao) — exportado em 2026-07-09
-- Gerado por: apps/api/scripts/export-rpc-definitions.ts (pg_get_functiondef).
--
-- Este arquivo e REGISTRO do que esta em producao, nao migration executavel
-- (as functions ja existem no banco). Se editar uma delas, atualize este
-- snapshot rodando o script de novo.
--
-- IMPORTANTE: NAO aplicar o REVOKE da "Parte B" de 2026-05-28-harden-operations.sql
-- enquanto o navegador depender de settle_trade/early_close_trade — o fluxo do
-- cliente (TradingPanel) chama essas RPCs diretamente.
-- ─── early_close_trade(p_operation_id uuid, p_refund_amount numeric) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.early_close_trade(p_operation_id uuid, p_refund_amount numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op     public.operations;
  v_refund numeric;
BEGIN
  SELECT * INTO v_op FROM public.operations
  WHERE id = p_operation_id
    AND status = 'OPEN'
    AND account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_NOT_FOUND'; END IF;

  -- Reembolso server-side: 80% do stake. Ignora p_refund_amount do cliente.
  v_refund := ROUND(v_op.amount * 0.80, 2);

  UPDATE public.operations
  SET status = 'LOST', profit = -(v_op.amount - v_refund),
      closed_at = now(), exit_price = v_op.entry_price, exit_price_source = 'SERVER'
  WHERE id = p_operation_id;

  UPDATE public.accounts SET balance = balance + v_refund WHERE id = v_op.account_id;

  INSERT INTO public.transactions (account_id, type, amount, description, operation_id)
  VALUES (v_op.account_id, 'EARLY_CLOSE', v_refund,
          'Saída antecipada: devolvido R$ ' || v_refund::text, p_operation_id);

  RETURN json_build_object('ok', true, 'refund', v_refund);
END;
$function$;

-- ─── is_forex_open_now() ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_forex_open_now()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_dow  int;   -- 0 = Domingo, 6 = Sábado
  v_hour int;
BEGIN
  v_dow  := EXTRACT(DOW  FROM (now() AT TIME ZONE 'UTC'))::int;
  v_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'UTC'))::int;

  IF v_dow = 6 THEN RETURN false; END IF;                  -- Sábado
  IF v_dow = 0 THEN RETURN v_hour >= 22; END IF;           -- Domingo: só após 22h UTC
  IF v_dow = 5 THEN RETURN v_hour <  22; END IF;           -- Sexta: até 22h UTC
  RETURN true;                                              -- Seg-Qui
END;
$function$;

-- ─── place_trade(p_account_id uuid, p_asset_id text, p_asset_symbol text, p_direction text, p_amount numeric, p_payout_pct numeric, p_entry_price numeric, p_expires_at timestamp with time zone) ─────────────────────────────────────────────────

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
  -- Modo manutenção: bloqueia abertura de novas operações.
  IF COALESCE((SELECT (value #>> '{}')::boolean FROM public.app_config WHERE key='maintenanceMode'), false) THEN
    RAISE EXCEPTION 'MAINTENANCE: Plataforma em manutenção. Novas operações temporariamente indisponíveis.';
  END IF;

  v_is_otc    := p_asset_id ILIKE '%otc%';
  v_is_crypto := p_asset_id ~* '^(btc|eth|sol|bnb|xrp|ada|doge|dot|matic|avax|link|atom|ltc|trx|near|fil|uni|aave|sand|mana|shib|ape|crv|gala|sushi)';

  -- Forex/commodity/stock (nao OTC, nao crypto): bloqueia fora do horario.
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
    -- Sem linha na tabela => mantém o comportamento anterior (teto 92), sem regressão.
    v_auth_payout := LEAST(p_payout_pct, COALESCE(v_ma_payout, 92));
  END IF;
  IF v_auth_payout IS NULL OR v_auth_payout <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYOUT';
  END IF;

  -- Entry price autoritativo do servidor (ignora p_entry_price).
  -- Forex publica a cada 240s -> tolerancia maior; OTC/cripto seguem 120s.
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

-- ─── settle_trade(p_operation_id uuid, p_exit_price numeric) ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.settle_trade(p_operation_id uuid, p_exit_price numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_op        public.operations;
  v_price     numeric;
  v_age_s     numeric;
  v_max_age   numeric;
  v_is_forex  boolean;
  v_exit      numeric;
  v_profit    numeric;
  v_status    text;
BEGIN
  SELECT * INTO v_op
  FROM public.operations
  WHERE id = p_operation_id
    AND status = 'OPEN'
    AND account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_NOT_FOUND'; END IF;

  IF now() < v_op.expires_at THEN
    RAISE EXCEPTION 'NOT_EXPIRED';
  END IF;

  -- Forex (nao-OTC, nao-cripto) publica a cada 240s -> tolerancia 300s; resto 120s.
  v_is_forex := NOT (v_op.asset_id ILIKE '%otc%')
            AND NOT (v_op.asset_id ~* '^(btc|eth|sol|bnb|xrp|ada|doge|dot|matic|avax|link|atom|ltc|trx|near|fil|uni|aave|sand|mana|shib|ape|crv|gala|sushi)');
  v_max_age := CASE WHEN v_is_forex THEN 300 ELSE 120 END;

  SELECT lp.price, extract(epoch FROM (now() - lp.updated_at))
    INTO v_price, v_age_s
  FROM public.live_prices lp
  WHERE lp.asset_id = v_op.asset_id;

  IF v_price IS NULL OR v_age_s > v_max_age THEN
    RAISE EXCEPTION 'PRICE_UNAVAILABLE';
  END IF;

  v_exit := v_price;

  IF (v_op.direction = 'CALL' AND v_exit > v_op.entry_price) OR
     (v_op.direction = 'PUT'  AND v_exit < v_op.entry_price) THEN
    v_status := 'WON';  v_profit := ROUND(v_op.amount * v_op.payout_pct / 100, 2);
  ELSIF v_exit = v_op.entry_price THEN
    v_status := 'DRAW'; v_profit := 0;
  ELSE
    v_status := 'LOST'; v_profit := -(v_op.amount);
  END IF;

  UPDATE public.operations
  SET status = v_status, exit_price = v_exit, profit = v_profit,
      closed_at = now(), exit_price_source = 'SERVER'
  WHERE id = p_operation_id;

  IF v_status = 'WON' THEN
    UPDATE public.accounts SET balance = balance + v_op.amount + v_profit WHERE id = v_op.account_id;
    INSERT INTO public.transactions (account_id, type, amount, description, operation_id)
    VALUES (v_op.account_id, 'TRADE_WIN', v_op.amount + v_profit,
            'Operação vencida: +R$ ' || v_profit::text, p_operation_id);
  ELSIF v_status = 'DRAW' THEN
    UPDATE public.accounts SET balance = balance + v_op.amount WHERE id = v_op.account_id;
    INSERT INTO public.transactions (account_id, type, amount, description, operation_id)
    VALUES (v_op.account_id, 'TRADE_DRAW', v_op.amount, 'Operação empatada: valor devolvido', p_operation_id);
  -- LOST: stake ja debitado na abertura. Nenhum lancamento adicional.
  END IF;

  RETURN json_build_object('status', v_status, 'profit', v_profit);
END;
$function$;
