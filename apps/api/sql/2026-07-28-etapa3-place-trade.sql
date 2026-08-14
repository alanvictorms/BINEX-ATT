-- ETAPA 3 — place_trade. Aplicado em producao 2026-07-28 via MCP.
-- ROLLBACK: apps/api/sql/2026-07-28-rpc-snapshot-place-trade-ANTES.sql
--
-- Quatro correcoes na mesma funcao, para abrir o hot-path uma vez so:
--
-- 1) TOLERANCIA DE PRECO VELHO PROPORCIONAL A DURACAO
--    Antes: 300s para forex, 120s para OTC/cripto — fixo, independente da opcao.
--    Uma opcao de 60s aceitava preco de 5 minutos atras. Quando o feed engasga, quem
--    olha o mercado real em outro lugar aposta sabendo o resultado.
--    Medicao em producao (28/07): live_prices avanca a cada 13-16s. Entao 45s de piso
--    da 3x de folga sobre a cadencia real, e o teto de 90s substitui os 300s.
--    Falha segura: feed parado agora RECUSA a operacao em vez de aceitar preco podre.
--
-- 2) profiles.custom_payout_forex/otc/crypto PASSA A SER LIDO
--    As colunas existem, o admin_update_user grava e o EditUserModal mostra — mas o
--    motor nunca leu. O admin prometia payout personalizado e nao acontecia nada.
--
-- 3) BOOSTERS VALEM
--    active_payout_boost() resolve campanha global, gatilho e compra da loja. O boost
--    e somado ao payout base e limitado por app_config.boosterMaxPayoutPct.
--
-- 4) ASSET_DISABLED NO RAMO OTC
--    Os ativos reais ja tinham; o OTC nao. Desligar liquidez de um par OTC so parava o
--    motor de precos e a operacao falhava 120s depois com PRICE_UNAVAILABLE.
--
-- MUDANCA DE CONTRATO: p_payout_pct do cliente passa a ser IGNORADO.
--   Antes: LEAST(p_payout_pct, autoritativo) — o cliente so conseguia baixar.
--   Isso impede qualquer boost de chegar: o front manda o payout sem boost e o LEAST
--   come o aumento. Agora o payout e 100% do servidor, exatamente como o entry_price
--   ja era ("ignora p_entry_price"). Fica mais seguro do que estava, nao menos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Rastro do booster na operacao (aditivo)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS booster_id uuid REFERENCES public.boosters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS operations_booster_idx
  ON public.operations (booster_id) WHERE booster_id IS NOT NULL;

-- Escape hatch: se algum feed ficar lento, da pra afrouxar sem migration.
INSERT INTO public.app_config (key, value)
VALUES ('priceMaxAgeCapSec', '90'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Consome a concessao do booster no momento da operacao.
--    O teto e de VOLUME OPERADO, entao o desconto e aqui (abertura), nao na
--    liquidacao. Boost de campanha global nao tem concessao — retorna NULL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_booster_grant(
  p_user_id  uuid,
  p_asset_id text,
  p_amount   numeric,
  p_boost    numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_grant   uuid;
  v_booster uuid;
BEGIN
  IF p_user_id IS NULL OR COALESCE(p_boost, 0) <= 0 THEN RETURN NULL; END IF;

  SELECT g.id, g.booster_id INTO v_grant, v_booster
  FROM public.booster_grants g
  WHERE g.user_id = p_user_id
    AND g.status = 'ACTIVE'
    AND g.uses_left > 0
    AND (g.expires_at IS NULL OR g.expires_at > now())
    AND EXISTS (
      SELECT 1 FROM public.boosters b
      WHERE b.id = g.booster_id
        AND b.kind = 'PAYOUT'
        AND b.enabled
        AND b.value = p_boost
        AND (b.asset_scope IS NULL OR p_asset_id = ANY (b.asset_scope))
        AND (b.max_stake IS NULL OR p_amount <= b.max_stake)
        AND (b.max_boosted_volume IS NULL OR g.volume_used + p_amount <= b.max_boosted_volume)
    )
  ORDER BY g.expires_at NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_grant IS NULL THEN RETURN NULL; END IF;   -- veio de campanha global

  UPDATE public.booster_grants
     SET volume_used = volume_used + p_amount,
         uses_left   = GREATEST(uses_left - 1, 0),
         status      = CASE WHEN uses_left - 1 <= 0 THEN 'USED' ELSE status END
   WHERE id = v_grant;

  RETURN v_booster;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_booster_grant(uuid,text,numeric,numeric) FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) place_trade
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_duration_s  numeric;
  v_cap_age     numeric;
  v_otc_payout  numeric;
  v_otc_active  boolean;
  v_ma_payout   numeric;
  v_ma_enabled  boolean;
  v_base_payout numeric;
  v_auth_payout numeric;
  v_custom      numeric;
  v_boost       numeric;
  v_cap_payout  numeric;
  v_booster_id  uuid;
  v_uid         uuid := auth.uid();
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

  -- ── Payout BASE, autoritativo do servidor ────────────────────────────────
  IF v_is_otc THEN
    SELECT payout, (status = 'ACTIVE') INTO v_otc_payout, v_otc_active
      FROM public.otc_assets
     WHERE symbol = upper(replace(replace(p_asset_id, '-otc', ''), '-', '')) || '-OTC';
    -- NOVO: par OTC com liquidez desligada recusa na hora (antes so parava o preco).
    IF FOUND AND v_otc_active = false THEN
      RAISE EXCEPTION 'ASSET_DISABLED: Este ativo está temporariamente indisponível.';
    END IF;
    v_base_payout := COALESCE(v_otc_payout, 92);
  ELSE
    SELECT payout, enabled INTO v_ma_payout, v_ma_enabled
      FROM public.market_assets WHERE id = p_asset_id;
    IF FOUND AND v_ma_enabled = false THEN
      RAISE EXCEPTION 'ASSET_DISABLED: Este ativo está temporariamente indisponível.';
    END IF;
    -- Sem linha na tabela => mantém o comportamento anterior (teto 92), sem regressão.
    v_base_payout := COALESCE(v_ma_payout, 92);
  END IF;

  -- ── Payout personalizado do usuário (Admin → Usuários) ───────────────────
  -- Sobrepõe o payout do ativo. Era gravado e nunca lido até aqui.
  IF v_uid IS NOT NULL THEN
    SELECT CASE
             WHEN v_is_otc    THEN pr.custom_payout_otc
             WHEN v_is_crypto THEN pr.custom_payout_crypto
             ELSE                  pr.custom_payout_forex
           END
      INTO v_custom
      FROM public.profiles pr WHERE pr.id = v_uid;

    IF v_custom IS NOT NULL AND v_custom > 0 THEN
      v_base_payout := v_custom;
    END IF;
  END IF;

  -- ── Booster (campanha global, gatilho ou compra na loja) ─────────────────
  v_boost := COALESCE(public.active_payout_boost(v_uid, p_asset_id, p_amount), 0);

  IF v_boost > 0 THEN
    v_cap_payout := COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config
                               WHERE key = 'boosterMaxPayoutPct'), 95);
    -- O teto limita o BOOST, nunca derruba um payout base que o admin escolheu.
    v_auth_payout := GREATEST(v_base_payout, LEAST(v_base_payout + v_boost, v_cap_payout));
  ELSE
    v_auth_payout := v_base_payout;
  END IF;

  IF v_auth_payout IS NULL OR v_auth_payout <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYOUT';
  END IF;

  -- ── Preço de entrada autoritativo (ignora p_entry_price) ─────────────────
  -- Idade máxima proporcional à duração da opção: uma opção de 1 minuto não pode
  -- ser aberta com preço de 5 minutos atrás. Piso de 45s porque o feed publica a
  -- cada 13-16s (medido em produção 28/07) — abaixo disso recusaria operação boa.
  v_cap_age    := COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config
                             WHERE key = 'priceMaxAgeCapSec'), 90);
  v_duration_s := GREATEST(COALESCE(extract(epoch FROM (p_expires_at - now())), 0), 0);
  v_max_age    := LEAST(GREATEST(v_duration_s, 45), v_cap_age);

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

  -- Consome a concessão do booster só depois de tudo validado.
  v_booster_id := public.consume_booster_grant(v_uid, p_asset_id, p_amount, v_boost);

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id;

  INSERT INTO public.operations
    (account_id, asset_id, asset_symbol, direction, amount, payout_pct,
     entry_price, entry_price_source, expires_at, booster_id)
  VALUES
    (p_account_id, p_asset_id, p_asset_symbol, p_direction, p_amount, v_auth_payout,
     v_price, 'SERVER', p_expires_at, v_booster_id)
  RETURNING id INTO v_op_id;

  INSERT INTO public.transactions (account_id, type, amount, description, operation_id)
  VALUES (p_account_id, 'TRADE_LOSS', -p_amount,
          'Operação aberta: ' || p_asset_symbol || ' ' || p_direction, v_op_id);

  RETURN json_build_object('id', v_op_id, 'entry_price', v_price, 'payout_pct', v_auth_payout);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Higiene pendente da auditoria: tirar o anon das RPCs de trading.
--    Nao era buraco (as tres checam auth.uid() e morrem em ACCOUNT_NOT_FOUND /
--    OPERATION_NOT_FOUND), mas nao ha motivo para anon enxergar isso.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.place_trade(uuid,text,text,text,numeric,numeric,numeric,timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.settle_trade(uuid,numeric)                                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.early_close_trade(uuid,numeric)                                      FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Deixa as chaves novas editaveis pelo admin (senao so por SQL)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_config(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_key NOT IN ('depositMin','depositMax','withdrawalMin','withdrawalMax',
                   'registrationEnabled','maintenanceMode','copyTradeEnabled',
                   'bonusFirstDepositEnabled','bonusFirstDepositPct','bonusFirstDepositMaxAmount',
                   'bonusRolloverMultiplier','bonusMinDeposit','bonusDepositPcts',
                   'boosterMaxPayoutPct','boosterVipMinDeposits','priceMaxAgeCapSec') THEN
    RAISE EXCEPTION 'Chave de configuração inválida: %', p_key;
  END IF;

  SELECT value INTO v_before FROM public.app_config WHERE key = p_key;

  INSERT INTO public.app_config (key, value) VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  PERFORM public.log_admin_action('set_config', 'config', NULL,
    jsonb_build_object('key', p_key, 'value', v_before),
    jsonb_build_object('key', p_key, 'value', p_value),
    NULL);
END;
$function$;
