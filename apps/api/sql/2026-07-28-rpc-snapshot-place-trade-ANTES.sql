-- BACKUP do place_trade ANTES da Etapa 3 (2026-07-28).
-- Copiado do prosrc de producao via MCP. ROLLBACK: rode este arquivo inteiro.
--
-- O que este backup NAO tem (e que a Etapa 3 adiciona):
--   - tolerancia de preco velho proporcional a duracao da opcao (aqui e fixa: 300s/120s)
--   - profiles.custom_payout_* (existe no banco e no admin, mas nunca foi lido)
--   - boosters (active_payout_boost)
--   - ASSET_DISABLED no ramo OTC (so os ativos reais tinham)

CREATE OR REPLACE FUNCTION public.place_trade(
  p_account_id uuid, p_asset_id text, p_asset_symbol text, p_direction text,
  p_amount numeric, p_payout_pct numeric, p_entry_price numeric,
  p_expires_at timestamp with time zone
)
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
