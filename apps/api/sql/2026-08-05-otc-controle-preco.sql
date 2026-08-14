-- OTC — Controle do preco sintetico (volatilidade ao vivo, sessao, auditoria).
--
-- ESTADO DE APLICACAO — TUDO APLICADO em producao 2026-08-05 via MCP:
--   Blocos 1-4 e 6: migration `otc_sessao_e_controle_preco`
--   Bloco 5 (place_trade): migration `otc_place_trade_sessao`
--   Bloco 7 (REVOKE de PUBLIC): ver nota abaixo — PENDENTE
--
-- A regra da janela existe em TRES lugares, que precisam concordar exatamente:
--   1. public.otc_session_open()                 (aqui — autoridade)
--   2. apps/api/src/market-data/otc/session.ts   (motor de preco + rota publica)
--   3. apps/web/src/lib/otcSession.ts            (so decide o que a tela mostra)
-- Tabela de 21 casos rodada contra as tres em 05/08: identicas.
--
-- CONTEXTO: a Mesa de risco (2026-07-28-otc-mesa-risco.sql) entregou exposicao ao
-- vivo, kill switch por par e a trava anti-direcionamento. O que faltava era o
-- controle do PROPRIO preco sintetico:
--
--   1) volatilidade ao vivo  -> RPC ja existia (admin_set_otc_volatility), sem tela
--   2) sessao de negociacao  -> as colunas session_start_utc/session_end_utc eram
--                               gravadas pelo Cadastro e NENHUM codigo lia. Campo
--                               decorativo desde 2026-05-24. Aqui elas passam a valer.
--   3) historico de mudancas -> RPC ja existia (admin_otc_param_log), sem tela
--
-- ESTADO EM PRODUCAO NA APLICACAO (05/08): os 14 pares tem session_start/end NULL,
-- e NULL significa 24 horas. Entao ligar a regra nao fecha nenhum par hoje — so
-- passa a existir o botao.
--
-- POR QUE A SESSAO NAO E UM VETOR DE CONGELAMENTO: o motor OTC continua tickando
-- qualquer par que tenha posicao aberta, mesmo fora da sessao ou com a liquidez
-- desligada (engine.ts). Sem isso, fechar a sessao pararia o feed e a liquidacao
-- do OTC (que le o ultimo preco do Redis, sem checar idade) resolveria as posicoes
-- abertas no preco congelado — ou seja, seria direcionamento de resultado por outro
-- caminho. Com o tick preservado, fechar sessao so bloqueia ENTRADA nova.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) A janela de sessao
--
--    Formato HH:MM em UTC, igual ao que o Cadastro ja gravava.
--    NULL/vazio nos dois campos = 24 horas (comportamento atual, sem regressao).
--    inicio == fim tambem = 24 horas.
--    inicio > fim = janela que cruza a meia-noite (ex.: 22:00 -> 06:00).
--
--    FALHA SEGURA: valor corrompido no banco devolve ABERTO. Um par nao deve
--    sumir do ar por causa de string malformada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.otc_session_open(p_start text, p_end text, p_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_now int;   -- minuto do dia, UTC
  v_s   int;
  v_e   int;
BEGIN
  IF p_at IS NULL THEN RETURN true; END IF;
  IF p_start IS NULL OR p_end IS NULL
     OR btrim(p_start) = '' OR btrim(p_end) = '' THEN
    RETURN true;                                  -- sem janela = 24 horas
  END IF;
  IF p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RETURN true;                                  -- falha segura
  END IF;

  v_now := extract(hour   FROM (p_at AT TIME ZONE 'UTC'))::int * 60
         + extract(minute FROM (p_at AT TIME ZONE 'UTC'))::int;
  v_s   := split_part(p_start, ':', 1)::int * 60 + split_part(p_start, ':', 2)::int;
  v_e   := split_part(p_end,   ':', 1)::int * 60 + split_part(p_end,   ':', 2)::int;

  IF v_s = v_e THEN RETURN true;  END IF;                        -- 24 horas
  IF v_s <  v_e THEN RETURN v_now >= v_s AND v_now < v_e; END IF; -- janela normal
  RETURN v_now >= v_s OR v_now < v_e;                            -- cruza a meia-noite
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Trocar a sessao pelo painel (validado + auditado)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_otc_session(p_id text, p_start text, p_end text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_s      text;
  v_e      text;
  v_before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  v_s := NULLIF(btrim(COALESCE(p_start, '')), '');
  v_e := NULLIF(btrim(COALESCE(p_end,   '')), '');

  IF (v_s IS NULL) <> (v_e IS NULL) THEN
    RAISE EXCEPTION 'Preencha início E fim da sessão, ou deixe os dois vazios para 24 horas.';
  END IF;

  IF v_s IS NOT NULL AND (v_s !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                          OR v_e !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'Horário inválido. Use HH:MM em UTC (ex.: 09:00).';
  END IF;

  SELECT to_jsonb(oa) INTO v_before FROM public.otc_assets oa WHERE oa.id = p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Ativo OTC não encontrado'; END IF;

  UPDATE public.otc_assets
     SET session_start_utc = v_s,
         session_end_utc   = v_e,
         updated_at        = now()
   WHERE id = p_id;

  PERFORM public.log_admin_action('otc_set_session', 'otc_asset', NULL, v_before,
    (SELECT to_jsonb(oa) FROM public.otc_assets oa WHERE oa.id = p_id), NULL);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Trigger de guarda: passa a registrar sessao tambem
--
--    Sessao NAO entra na lista de campos bloqueados com posicao aberta (trend e
--    base_price continuam bloqueados). Motivo: com o motor tickando os pares que
--    tem posicao aberta, mudar a janela nao move nem congela preco de ninguem —
--    so muda quem consegue ENTRAR. Mas fica registrado.
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
  -- NOVO: janela de negociação
  IF NEW.session_start_utc IS DISTINCT FROM OLD.session_start_utc
     OR NEW.session_end_utc IS DISTINCT FROM OLD.session_end_utc THEN
    INSERT INTO public.otc_param_log (asset_id, symbol, changed_by, field, old_value, new_value, open_ops)
    VALUES (NEW.id, NEW.symbol, auth.uid(), 'session',
            COALESCE(OLD.session_start_utc, '00:00') || '–' || COALESCE(OLD.session_end_utc, '24:00'),
            COALESCE(NEW.session_start_utc, '00:00') || '–' || COALESCE(NEW.session_end_utc, '24:00'),
            v_open);
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) A mesa devolve sessao + estado da sessao
--    (identica a de 2026-07-28, mais tres campos por linha)
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
          'price_age_s', CASE WHEN lp.updated_at IS NULL THEN NULL
                              ELSE round(extract(epoch FROM (now() - lp.updated_at))::numeric, 1) END,
          'open_calls',  COALESCE(x.calls_n, 0),
          'open_puts',   COALESCE(x.puts_n, 0),
          'amount_call', COALESCE(x.calls_amt, 0),
          'amount_put',  COALESCE(x.puts_amt, 0),
          'traders',     COALESCE(x.traders, 0),
          'exposure',    COALESCE(x.calls_amt, 0) + COALESCE(x.puts_amt, 0),
          'net_if_call', COALESCE(x.puts_amt, 0)  - COALESCE(x.calls_amt, 0) * oa.payout / 100.0,
          'net_if_put',  COALESCE(x.calls_amt, 0) - COALESCE(x.puts_amt, 0)  * oa.payout / 100.0,
          -- CADEADO: usa a MESMA funcao do trigger (migration
          -- `otc_params_locked_usa_mesma_fonte_do_trigger`, 05/08). Antes vinha da
          -- subquery x, que filtra is_internal — entao posicao aberta numa conta
          -- interna travava o UPDATE e a mesa mostrava "Livre". O filtro is_internal
          -- esta certo na EXPOSICAO (nao e dinheiro em risco) e errado no CADEADO.
          'params_locked',    public.otc_open_positions(oa.id, oa.symbol) > 0,
          'locked_positions', public.otc_open_positions(oa.id, oa.symbol),
          -- NOVO: janela de negociação
          'session_start', oa.session_start_utc,
          'session_end',   oa.session_end_utc,
          'session_open',  public.otc_session_open(oa.session_start_utc, oa.session_end_utc, now())
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
            AND NOT COALESCE(p.is_internal, false)
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
-- 5) place_trade — a sessao passa a valer no hot path
--    ROLLBACK: apps/api/sql/2026-07-28-etapa3-place-trade.sql (versao anterior)
--              + apps/api/sql/2026-07-31-URGENTE-place-trade-amount-positivo.sql
--
--    Duas checagens novas, so no ramo OTC:
--      a) agora fora da janela            -> MARKET_CLOSED
--      b) a opcao venceria fora da janela -> MARKET_CLOSED (prazo maior que o
--         que falta pro fechamento). Assim nenhuma posicao atravessa o fechamento
--         do par, e a liquidacao nunca depende de preco de par fechado.
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
  v_otc_found   boolean;
  v_sess_start  text;
  v_sess_end    text;
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
  -- Entrada tem que ser positiva (2026-07-31).
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: O valor da operação precisa ser maior que zero.';
  END IF;

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
    SELECT payout, (status = 'ACTIVE'), session_start_utc, session_end_utc
      INTO v_otc_payout, v_otc_active, v_sess_start, v_sess_end
      FROM public.otc_assets
     WHERE symbol = upper(replace(replace(p_asset_id, '-otc', ''), '-', '')) || '-OTC';
    v_otc_found := FOUND;

    -- Par OTC com liquidez desligada recusa na hora.
    IF v_otc_found AND v_otc_active = false THEN
      RAISE EXCEPTION 'ASSET_DISABLED: Este ativo está temporariamente indisponível.';
    END IF;

    -- NOVO: janela de negociação do par (HH:MM UTC; NULL = 24 horas).
    IF v_otc_found AND NOT public.otc_session_open(v_sess_start, v_sess_end, now()) THEN
      RAISE EXCEPTION 'MARKET_CLOSED: O mercado deste ativo está fechado neste momento.';
    END IF;

    -- NOVO: a opção não pode atravessar o fechamento do par.
    IF v_otc_found AND NOT public.otc_session_open(v_sess_start, v_sess_end, p_expires_at) THEN
      RAISE EXCEPTION 'MARKET_CLOSED: Esta opção venceria depois do fechamento deste ativo. Escolha um prazo menor.';
    END IF;

    v_base_payout := COALESCE(v_otc_payout, 92);
  ELSE
    SELECT payout, enabled INTO v_ma_payout, v_ma_enabled
      FROM public.market_assets WHERE id = p_asset_id;
    IF FOUND AND v_ma_enabled = false THEN
      RAISE EXCEPTION 'ASSET_DISABLED: Este ativo está temporariamente indisponível.';
    END IF;
    v_base_payout := COALESCE(v_ma_payout, 92);
  END IF;

  -- ── Payout personalizado do usuário (Admin → Usuários) ───────────────────
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
    v_auth_payout := GREATEST(v_base_payout, LEAST(v_base_payout + v_boost, v_cap_payout));
  ELSE
    v_auth_payout := v_base_payout;
  END IF;

  IF v_auth_payout IS NULL OR v_auth_payout <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYOUT';
  END IF;

  -- ── Preço de entrada autoritativo (ignora p_entry_price) ─────────────────
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
-- 6) Permissoes
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_set_otc_session(text, text, text)      FROM public, anon;
REVOKE ALL ON FUNCTION public.otc_session_open(text, text, timestamptz)    FROM public, anon;

GRANT EXECUTE ON FUNCTION public.admin_set_otc_session(text, text, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.otc_session_open(text, text, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.place_trade(uuid,text,text,text,numeric,numeric,numeric,timestamptz) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) ACHADO 05/08 — o REVOKE de `anon` de 28/07 nunca fez nada.  [PENDENTE]
--
--    A ACL das tres RPCs de trading esta assim:
--      {=X/postgres, postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--       ^^^^^^^^^^^ este `=X` sem role antes do `=` e o PUBLIC.
--
--    `anon` nunca teve grant DIRETO — ele herda EXECUTE de PUBLIC, que toda funcao
--    ganha na criacao. Entao `REVOKE ... FROM anon` remove um privilegio que nao
--    existe e sai com sucesso, sem mudar nada. Confirmado:
--      has_function_privilege('anon', 'place_trade(...)', 'EXECUTE') = true
--    depois dos REVOKEs de 28/07 E do desta migration.
--
--    NAO E BURACO DE DINHEIRO: as tres barram por `user_id = auth.uid()` e anon tem
--    auth.uid() NULL, entao morrem em ACCOUNT_NOT_FOUND / OPERATION_NOT_FOUND antes
--    de tocar saldo. O que vaza e superficie: com a anon key publica da-pra fazer o
--    place_trade ler app_config, otc_assets, market_assets e live_prices por dentro
--    (SECURITY DEFINER) antes de falhar, e medir tempos de resposta.
--
--    O CONSERTO (revogar de PUBLIC, nao de anon). Nao aplicado ainda porque tira
--    acesso de todo role sem grant explicito — hoje restam postgres, authenticated e
--    service_role, que e exatamente a intencao, mas confirme antes:
--
--      REVOKE EXECUTE ON FUNCTION public.place_trade(uuid,text,text,text,numeric,numeric,numeric,timestamptz) FROM PUBLIC;
--      REVOKE EXECUTE ON FUNCTION public.settle_trade(uuid,numeric)                                           FROM PUBLIC;
--      REVOKE EXECUTE ON FUNCTION public.early_close_trade(uuid,numeric)                                      FROM PUBLIC;
--
--    Verificacao depois de aplicar (os tres precisam dar false):
--      SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE')
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public'
--        AND p.proname IN ('place_trade','settle_trade','early_close_trade');
--
--    Mesma armadilha vale pros REVOKEs `FROM public, anon` de 28/07-otc-mesa-risco.sql:
--    la o `public` esta escrito, entao aqueles funcionaram. E so nestes tres que o
--    alvo foi so `anon`.
-- ─────────────────────────────────────────────────────────────────────────────
