-- Boosters — Etapa 2B: loja de boosters (booster como produto pago).
-- Aplicado em producao (Supabase yilmbwrfaljxgvsygmyz) 2026-07-28 via MCP.
-- Continuacao de 2026-07-28-boosters.sql.
--
-- MOTIVACAO: a referencia que o founder trouxe nao e um sistema de campanhas, e uma
-- LOJA — o usuario compra o booster (tem coluna de preco e aba de compras). Isso vira
-- linha de receita em vez de custo. As duas coisas passam a conviver:
--
--   source = 'CAMPAIGN'  -> voce da de graca (marketing). Janela de calendario ou gatilho.
--   source = 'SHOP'      -> o usuario compra. Preco + duracao a partir da ativacao.
--
-- O QUE A REFERENCIA NAO TEM E AQUI TEM: teto de volume boostado. Sem ele, vender um
-- booster de +5 p.p. por R$10 e cheque em branco — quem opera R$3.000 na hora custa
-- R$75 de payout extra. Com max_boosted_volume, o custo maximo e deterministico:
--   custo_max = max_boosted_volume x 0,5 x (value/100)
-- e ai da pra precificar acima disso.
--
-- MUDANCA DE SEMANTICA: CASHBACK.value passa a ser % do prejuizo devolvido (era valor
-- fixo em R$), limitado por max_amount (teto em R$) + max_boosted_volume. Com os dois
-- tetos, o % fica tao limitado quanto o valor fixo, e casa com o modelo da referencia.
-- Seguro fazer agora: a unica linha existente e o [EXEMPLO] de PAYOUT.
--
-- O MOTOR CONTINUA SEM LER NADA DISSO. place_trade e settle_trade seguem intactos.
-- volume_used so passa a ser incrementado na Etapa 3.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Campanhas ganham as colunas de produto
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.boosters
  ADD COLUMN IF NOT EXISTS source             text    NOT NULL DEFAULT 'CAMPAIGN',
  ADD COLUMN IF NOT EXISTS price              numeric,
  ADD COLUMN IF NOT EXISTS duration_minutes   int,
  ADD COLUMN IF NOT EXISTS tier               text    NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS max_boosted_volume numeric,
  ADD COLUMN IF NOT EXISTS max_amount         numeric,
  ADD COLUMN IF NOT EXISTS display_order      int     NOT NULL DEFAULT 0;

ALTER TABLE public.boosters DROP CONSTRAINT IF EXISTS boosters_source_ck;
ALTER TABLE public.boosters ADD  CONSTRAINT boosters_source_ck
  CHECK (source IN ('CAMPAIGN','SHOP'));

ALTER TABLE public.boosters DROP CONSTRAINT IF EXISTS boosters_tier_ck;
ALTER TABLE public.boosters ADD  CONSTRAINT boosters_tier_ck
  CHECK (tier IN ('NORMAL','VIP'));

ALTER TABLE public.boosters DROP CONSTRAINT IF EXISTS boosters_price_ck;
ALTER TABLE public.boosters ADD  CONSTRAINT boosters_price_ck
  CHECK (price IS NULL OR price > 0);

ALTER TABLE public.boosters DROP CONSTRAINT IF EXISTS boosters_duration_ck;
ALTER TABLE public.boosters ADD  CONSTRAINT boosters_duration_ck
  CHECK (duration_minutes IS NULL OR duration_minutes > 0);

ALTER TABLE public.boosters DROP CONSTRAINT IF EXISTS boosters_volume_ck;
ALTER TABLE public.boosters ADD  CONSTRAINT boosters_volume_ck
  CHECK (max_boosted_volume IS NULL OR max_boosted_volume > 0);

-- Campanha global exige janela; campanha por evento exige gatilho; loja nao precisa
-- de nenhum dos dois (a duracao conta a partir da compra).
ALTER TABLE public.boosters DROP CONSTRAINT IF EXISTS boosters_scope_ck;
ALTER TABLE public.boosters ADD  CONSTRAINT boosters_scope_ck CHECK (
  source = 'SHOP'
  OR trigger_event IS NOT NULL
  OR (starts_at IS NOT NULL AND ends_at IS NOT NULL)
);

-- Produto de loja sem preco, sem duracao ou sem teto de volume nao existe.
ALTER TABLE public.boosters DROP CONSTRAINT IF EXISTS boosters_shop_ck;
ALTER TABLE public.boosters ADD  CONSTRAINT boosters_shop_ck CHECK (
  source <> 'SHOP'
  OR (price IS NOT NULL AND duration_minutes IS NOT NULL AND max_boosted_volume IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Concessoes: quando comecou, quanto de volume ja consumiu, quanto pagou
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.booster_grants
  ADD COLUMN IF NOT EXISTS activated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS volume_used  numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_paid   numeric     NOT NULL DEFAULT 0;

ALTER TABLE public.booster_grants DROP CONSTRAINT IF EXISTS booster_grants_granted_by_check;
ALTER TABLE public.booster_grants ADD  CONSTRAINT booster_grants_granted_by_check
  CHECK (granted_by IN ('AUTO','ADMIN','PURCHASE'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Razao passa a ter os dois lados: receita e custo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.booster_ledger
  ADD COLUMN IF NOT EXISTS revenue numeric NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) transactions: novo tipo pra compra de booster (espelha COPY_PURCHASE)
--    Alargamento do CHECK — nenhum registro existente vira invalido.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD  CONSTRAINT transactions_type_check CHECK (
  type = ANY (ARRAY['DEPOSIT','WITHDRAWAL','TRADE_WIN','TRADE_LOSS','TRADE_DRAW',
                    'EARLY_CLOSE','DEMO_RESET','BONUS','COPY_PURCHASE','COPY_RESULT',
                    'BOOSTER_PURCHASE'])
);

-- Regra de VIP. Enquanto o modulo Niveis nao existe, VIP = total depositado.
INSERT INTO public.app_config (key, value)
VALUES ('boosterVipMinDeposits', '1000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Quem e VIP
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_booster_vip(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
  SELECT COALESCE(SUM(d.amount), 0)
         >= COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config
                       WHERE key = 'boosterVipMinDeposits'), 1000)
  FROM public.deposits d
  WHERE d.user_id = p_user_id
    AND d.status = 'confirmed'
    AND NOT COALESCE(d.is_fake, false);
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Resolucao do boost — agora cobre campanha global, gatilho e compra
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.active_payout_boost(
  p_user_id  uuid,
  p_asset_id text,
  p_amount   numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
  -- Maior boost aplicavel vence (nao acumula).
  SELECT COALESCE(MAX(b.value), 0)
  FROM public.boosters b
  WHERE b.kind = 'PAYOUT'
    AND b.enabled = true
    AND (b.asset_scope IS NULL OR p_asset_id = ANY (b.asset_scope))
    AND (p_amount IS NULL OR b.max_stake IS NULL OR p_amount <= b.max_stake)
    AND (
      -- (a) campanha global: vale pra todos dentro da janela
      (
        b.source = 'CAMPAIGN'
        AND b.trigger_event IS NULL
        AND (b.starts_at IS NULL OR now() >= b.starts_at)
        AND (b.ends_at   IS NULL OR now() <= b.ends_at)
        AND (
          b.daily_start IS NULL
          OR (
            CASE WHEN b.daily_start <= b.daily_end
              THEN (now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN b.daily_start AND b.daily_end
              ELSE (now() AT TIME ZONE 'America/Sao_Paulo')::time >= b.daily_start
                OR (now() AT TIME ZONE 'America/Sao_Paulo')::time <= b.daily_end
            END
          )
        )
      )
      -- (b) concessao individual: veio de gatilho automatico ou de compra
      OR EXISTS (
        SELECT 1 FROM public.booster_grants g
        WHERE g.booster_id = b.id
          AND g.user_id = p_user_id
          AND g.status = 'ACTIVE'
          AND g.uses_left > 0
          AND (g.expires_at IS NULL OR g.expires_at > now())
          -- teto de volume: a operacao inteira tem que caber no que sobrou
          AND (b.max_boosted_volume IS NULL
               OR g.volume_used + COALESCE(p_amount, 0) <= b.max_boosted_volume)
      )
    );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Vitrine — o que o usuario ve e pode comprar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_booster_shop()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_vip boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  v_vip := public.is_booster_vip(v_uid);

  RETURN json_build_object(
    'vip', v_vip,
    'items', COALESCE((
      SELECT json_agg(json_build_object(
        'id', b.id, 'name', b.name, 'kind', b.kind, 'value', b.value,
        'price', b.price, 'duration_minutes', b.duration_minutes, 'tier', b.tier,
        'max_stake', b.max_stake, 'max_boosted_volume', b.max_boosted_volume,
        'max_amount', b.max_amount, 'asset_scope', b.asset_scope,
        'locked', (b.tier = 'VIP' AND NOT v_vip)
      ) ORDER BY b.display_order, b.price)
      FROM public.boosters b
      WHERE b.source = 'SHOP'
        AND b.enabled = true
        AND (b.starts_at IS NULL OR now() >= b.starts_at)
        AND (b.ends_at   IS NULL OR now() <= b.ends_at)
    ), '[]'::json),
    'active', COALESCE((
      SELECT json_agg(json_build_object(
        'grant_id', g.id, 'name', b.name, 'kind', b.kind, 'value', b.value,
        'expires_at', g.expires_at, 'uses_left', g.uses_left,
        'volume_used', g.volume_used, 'max_boosted_volume', b.max_boosted_volume
      ) ORDER BY g.expires_at)
      FROM public.booster_grants g
      JOIN public.boosters b ON b.id = g.booster_id
      WHERE g.user_id = v_uid
        AND g.status = 'ACTIVE'
        AND (g.expires_at IS NULL OR g.expires_at > now())
    ), '[]'::json)
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Compra
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buy_booster(p_booster_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_b        public.boosters;
  v_acc      public.accounts;
  v_bonus    numeric;
  v_free     numeric;
  v_owned    int;
  v_grant_id uuid;
  v_expires  timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_b FROM public.boosters WHERE id = p_booster_id;
  IF NOT FOUND OR NOT v_b.enabled OR v_b.source <> 'SHOP' THEN
    RAISE EXCEPTION 'BOOSTER_UNAVAILABLE: Este booster não está disponível.';
  END IF;

  IF (v_b.starts_at IS NOT NULL AND now() < v_b.starts_at)
     OR (v_b.ends_at IS NOT NULL AND now() > v_b.ends_at) THEN
    RAISE EXCEPTION 'BOOSTER_UNAVAILABLE: Este booster não está disponível.';
  END IF;

  IF v_b.tier = 'VIP' AND NOT public.is_booster_vip(v_uid) THEN
    RAISE EXCEPTION 'VIP_REQUIRED: Este booster é exclusivo para contas VIP.';
  END IF;

  -- Um booster ativo por tipo. Sem isto o usuario empilha efeito comprando varios.
  IF EXISTS (
    SELECT 1 FROM public.booster_grants g
    JOIN public.boosters bb ON bb.id = g.booster_id
    WHERE g.user_id = v_uid
      AND g.status = 'ACTIVE'
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND bb.kind = v_b.kind
  ) THEN
    RAISE EXCEPTION 'ALREADY_ACTIVE: Você já tem um booster deste tipo ativo.';
  END IF;

  IF v_b.max_grants_per_user IS NOT NULL THEN
    SELECT count(*) INTO v_owned FROM public.booster_grants
     WHERE booster_id = v_b.id AND user_id = v_uid AND status <> 'REVOKED';
    IF v_owned >= v_b.max_grants_per_user THEN
      RAISE EXCEPTION 'LIMIT_REACHED: Você já atingiu o limite de compras deste booster.';
    END IF;
  END IF;

  SELECT * INTO v_acc FROM public.accounts
   WHERE user_id = v_uid AND type = 'REAL'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;

  -- So dinheiro LIVRE compra booster. Saldo de bonus fica travado no rollover —
  -- deixar bonus virar booster seria uma rota de saida do bonus sem cumprir volume.
  SELECT COALESCE(bonus_balance, 0) INTO v_bonus FROM public.profiles WHERE id = v_uid;
  v_free := v_acc.balance - COALESCE(v_bonus, 0);
  IF v_free < v_b.price THEN
    RAISE EXCEPTION 'INSUFFICIENT_FREE_BALANCE: Saldo livre insuficiente (bônus não pode ser usado para comprar booster).';
  END IF;

  v_expires := now() + make_interval(mins => v_b.duration_minutes);

  UPDATE public.accounts SET balance = balance - v_b.price WHERE id = v_acc.id;

  INSERT INTO public.booster_grants
    (booster_id, user_id, status, uses_left, activated_at, expires_at, granted_by, price_paid)
  VALUES
    (v_b.id, v_uid, 'ACTIVE', v_b.uses_per_grant, now(), v_expires, 'PURCHASE', v_b.price)
  RETURNING id INTO v_grant_id;

  INSERT INTO public.transactions (account_id, type, amount, description)
  VALUES (v_acc.id, 'BOOSTER_PURCHASE', -v_b.price, 'Booster: ' || v_b.name);

  INSERT INTO public.booster_ledger (booster_id, grant_id, user_id, kind, cost, revenue)
  VALUES (v_b.id, v_grant_id, v_uid, v_b.kind, 0, v_b.price);

  RETURN json_build_object('grant_id', v_grant_id, 'expires_at', v_expires);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Admin: listagem com receita, custo e liquido
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_boosters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  RETURN jsonb_build_object(
    'max_payout_cap',   COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config WHERE key='boosterMaxPayoutPct'), 95),
    'vip_min_deposits', COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config WHERE key='boosterVipMinDeposits'), 1000),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'kind', b.kind, 'source', b.source,
        'enabled', b.enabled, 'value', b.value, 'tier', b.tier,
        'price', b.price, 'duration_minutes', b.duration_minutes,
        'max_stake', b.max_stake, 'max_boosted_volume', b.max_boosted_volume,
        'max_amount', b.max_amount, 'max_grants_per_user', b.max_grants_per_user,
        'asset_scope', b.asset_scope, 'display_order', b.display_order,
        'starts_at', b.starts_at, 'ends_at', b.ends_at,
        'daily_start', b.daily_start, 'daily_end', b.daily_end,
        'trigger_event', b.trigger_event, 'trigger_param', b.trigger_param,
        'grant_ttl_hours', b.grant_ttl_hours, 'uses_per_grant', b.uses_per_grant,
        'created_at', b.created_at,
        'active_grants', (
          SELECT count(*) FROM public.booster_grants g
          WHERE g.booster_id = b.id AND g.status = 'ACTIVE'
            AND (g.expires_at IS NULL OR g.expires_at > now())
        ),
        'sold', (
          SELECT count(*) FROM public.booster_grants g
          WHERE g.booster_id = b.id AND g.granted_by = 'PURCHASE'
        ),
        'total_revenue', COALESCE((SELECT sum(l.revenue) FROM public.booster_ledger l WHERE l.booster_id = b.id), 0),
        'total_cost',    COALESCE((SELECT sum(l.cost)    FROM public.booster_ledger l WHERE l.booster_id = b.id), 0)
      ) ORDER BY b.source, b.enabled DESC, b.display_order, b.created_at DESC)
      FROM public.boosters b
    ), '[]'::jsonb)
  );
END;
$function$;

-- Aba "Compras de boosters"
CREATE OR REPLACE FUNCTION public.admin_list_booster_purchases(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 100,
  p_offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_total   int;
  v_revenue numeric;
  v_cost    numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT count(*) INTO v_total
  FROM public.booster_grants g
  JOIN public.boosters b ON b.id = g.booster_id
  JOIN public.profiles p ON p.id = g.user_id
  WHERE g.granted_by = 'PURCHASE'
    AND (p_search IS NULL OR p.name ILIKE '%'||p_search||'%' OR b.name ILIKE '%'||p_search||'%');

  SELECT COALESCE(sum(revenue),0), COALESCE(sum(cost),0) INTO v_revenue, v_cost
  FROM public.booster_ledger;

  RETURN jsonb_build_object(
    'total',   v_total,
    'revenue', v_revenue,
    'cost',    v_cost,
    'net',     v_revenue - v_cost,
    'rows', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'bought_at' DESC) FROM (
        SELECT jsonb_build_object(
          'grant_id',   g.id,
          'user_name',  p.name,
          'booster',    b.name,
          'kind',       b.kind,
          'tier',       b.tier,
          'price_paid', g.price_paid,
          'bought_at',  g.activated_at,
          'expires_at', g.expires_at,
          'status',     CASE WHEN g.status <> 'ACTIVE' THEN g.status
                             WHEN g.expires_at IS NOT NULL AND g.expires_at <= now() THEN 'EXPIRED'
                             ELSE 'ACTIVE' END,
          'volume_used', g.volume_used,
          'cost', COALESCE((SELECT sum(l.cost) FROM public.booster_ledger l WHERE l.grant_id = g.id), 0),
          -- "Trades no periodo": cruza as operacoes REAIS do usuario com a janela do
          -- booster. Funciona sem o motor estar ligado — e so tempo.
          'trades', COALESCE((
            SELECT count(*) FROM public.operations o
            JOIN public.accounts a ON a.id = o.account_id
            WHERE a.user_id = g.user_id AND a.type = 'REAL'
              AND o.created_at >= g.activated_at
              AND o.created_at <= COALESCE(g.expires_at, now())
          ), 0),
          'traded_volume', COALESCE((
            SELECT sum(o.amount) FROM public.operations o
            JOIN public.accounts a ON a.id = o.account_id
            WHERE a.user_id = g.user_id AND a.type = 'REAL'
              AND o.created_at >= g.activated_at
              AND o.created_at <= COALESCE(g.expires_at, now())
          ), 0)
        ) AS x
        FROM public.booster_grants g
        JOIN public.boosters b ON b.id = g.booster_id
        JOIN public.profiles p ON p.id = g.user_id
        WHERE g.granted_by = 'PURCHASE'
          AND (p_search IS NULL OR p.name ILIKE '%'||p_search||'%' OR b.name ILIKE '%'||p_search||'%')
        ORDER BY g.activated_at DESC
        LIMIT COALESCE(p_limit,100) OFFSET COALESCE(p_offset,0)
      ) s
    ), '[]'::jsonb)
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Upsert com os campos de loja. Assinatura mudou -> DROP antes.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_upsert_booster(uuid,text,text,numeric,numeric,int,text[],timestamptz,timestamptz,time,time,text,int,int,int);

CREATE OR REPLACE FUNCTION public.admin_upsert_booster(
  p_id                  uuid,
  p_name                text,
  p_kind                text,
  p_source              text,
  p_value               numeric,
  p_price               numeric     DEFAULT NULL,
  p_duration_minutes    int         DEFAULT NULL,
  p_tier                text        DEFAULT 'NORMAL',
  p_max_stake           numeric     DEFAULT NULL,
  p_max_boosted_volume  numeric     DEFAULT NULL,
  p_max_amount          numeric     DEFAULT NULL,
  p_max_grants_per_user int         DEFAULT NULL,
  p_asset_scope         text[]      DEFAULT NULL,
  p_starts_at           timestamptz DEFAULT NULL,
  p_ends_at             timestamptz DEFAULT NULL,
  p_daily_start         time        DEFAULT NULL,
  p_daily_end           time        DEFAULT NULL,
  p_trigger_event       text        DEFAULT NULL,
  p_trigger_param       int         DEFAULT NULL,
  p_grant_ttl_hours     int         DEFAULT 24,
  p_uses_per_grant      int         DEFAULT 1,
  p_display_order       int         DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_id      uuid;
  v_before  jsonb;
  v_cost_max numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome obrigatório'; END IF;
  IF p_kind   NOT IN ('PAYOUT','CASHBACK')  THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF p_source NOT IN ('CAMPAIGN','SHOP')    THEN RAISE EXCEPTION 'Origem inválida'; END IF;
  IF p_tier   NOT IN ('NORMAL','VIP')       THEN RAISE EXCEPTION 'Nível inválido'; END IF;
  IF p_value IS NULL OR p_value <= 0        THEN RAISE EXCEPTION 'Valor deve ser maior que zero'; END IF;

  IF p_kind = 'PAYOUT' AND p_value > 30 THEN
    RAISE EXCEPTION 'Boost de payout acima de 30 pontos percentuais não é permitido (recebido: %)', p_value;
  END IF;
  IF p_kind = 'CASHBACK' AND p_value > 100 THEN
    RAISE EXCEPTION 'Cashback não pode passar de 100%% do prejuízo (recebido: %)', p_value;
  END IF;

  IF p_source = 'SHOP' THEN
    IF p_price IS NULL OR p_price <= 0 THEN
      RAISE EXCEPTION 'Booster de loja precisa de preço';
    END IF;
    IF p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
      RAISE EXCEPTION 'Booster de loja precisa de duração';
    END IF;
    IF p_max_boosted_volume IS NULL OR p_max_boosted_volume <= 0 THEN
      RAISE EXCEPTION 'Booster de loja precisa de teto de volume — sem ele o custo é ilimitado';
    END IF;

    -- Trava economica: o preco tem que cobrir o custo esperado no pior caso.
    -- PAYOUT   -> volume x 0,5 x (pontos/100)   (paga o extra so nas vitorias)
    -- CASHBACK -> volume x 0,5 x (pct/100)      (paga so nas derrotas), limitado por max_amount
    v_cost_max := p_max_boosted_volume * 0.5 * (p_value / 100.0);
    IF p_kind = 'CASHBACK' AND p_max_amount IS NOT NULL THEN
      v_cost_max := LEAST(v_cost_max, p_max_amount);
    END IF;
    IF p_price < v_cost_max THEN
      RAISE EXCEPTION 'Preço R$% fica abaixo do custo esperado R$% (volume R$% com boost de % pontos). Suba o preço ou baixe o teto de volume.',
        round(p_price,2), round(v_cost_max,2), round(p_max_boosted_volume,2), p_value;
    END IF;
  END IF;

  IF p_kind = 'CASHBACK' AND p_source = 'CAMPAIGN' AND p_max_grants_per_user IS NULL THEN
    RAISE EXCEPTION 'Cashback de campanha exige limite de concessões por usuário';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT to_jsonb(b) INTO v_before FROM public.boosters b WHERE b.id = p_id;
  END IF;

  INSERT INTO public.boosters AS b (
    id, name, kind, source, value, price, duration_minutes, tier,
    max_stake, max_boosted_volume, max_amount, max_grants_per_user, asset_scope,
    starts_at, ends_at, daily_start, daily_end,
    trigger_event, trigger_param, grant_ttl_hours, uses_per_grant, display_order
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()), btrim(p_name), p_kind, p_source, p_value,
    p_price, p_duration_minutes, p_tier,
    p_max_stake, p_max_boosted_volume, p_max_amount, p_max_grants_per_user, p_asset_scope,
    p_starts_at, p_ends_at, p_daily_start, p_daily_end,
    p_trigger_event, p_trigger_param, COALESCE(p_grant_ttl_hours,24), COALESCE(p_uses_per_grant,1),
    COALESCE(p_display_order,0)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, kind = EXCLUDED.kind, source = EXCLUDED.source,
    value = EXCLUDED.value, price = EXCLUDED.price,
    duration_minutes = EXCLUDED.duration_minutes, tier = EXCLUDED.tier,
    max_stake = EXCLUDED.max_stake, max_boosted_volume = EXCLUDED.max_boosted_volume,
    max_amount = EXCLUDED.max_amount, max_grants_per_user = EXCLUDED.max_grants_per_user,
    asset_scope = EXCLUDED.asset_scope,
    starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    daily_start = EXCLUDED.daily_start, daily_end = EXCLUDED.daily_end,
    trigger_event = EXCLUDED.trigger_event, trigger_param = EXCLUDED.trigger_param,
    grant_ttl_hours = EXCLUDED.grant_ttl_hours, uses_per_grant = EXCLUDED.uses_per_grant,
    display_order = EXCLUDED.display_order,
    updated_at = now()
  RETURNING b.id INTO v_id;

  PERFORM public.log_admin_action(
    CASE WHEN v_before IS NULL THEN 'create_booster' ELSE 'update_booster' END,
    'booster', v_id, v_before,
    (SELECT to_jsonb(b) FROM public.boosters b WHERE b.id = v_id), NULL);

  RETURN v_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) Permissoes
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.is_booster_vip(uuid)                                   FROM public, anon;
REVOKE ALL ON FUNCTION public.list_booster_shop()                                    FROM public, anon;
REVOKE ALL ON FUNCTION public.buy_booster(uuid)                                      FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_booster_purchases(text,int,int)             FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_booster(uuid,text,text,text,numeric,numeric,int,text,numeric,numeric,numeric,int,text[],timestamptz,timestamptz,time,time,text,int,int,int,int) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.is_booster_vip(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_booster_shop()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_booster(uuid)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_booster_purchases(text,int,int)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_booster(uuid,text,text,text,numeric,numeric,int,text,numeric,numeric,numeric,int,text[],timestamptz,timestamptz,time,time,text,int,int,int,int) TO authenticated;
