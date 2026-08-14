-- Boosters — Etapa 1: base do banco (tabelas + RPCs admin + leitura publica).
-- Aplicado em producao (Supabase yilmbwrfaljxgvsygmyz) 2026-07-28 via MCP.
-- Este arquivo e o REGISTRO do que foi rodado.
--
-- IMPORTANTE: esta etapa NAO altera place_trade nem settle_trade. Nada aqui muda o
-- comportamento do motor. Os boosters ficam cadastrados e visiveis no admin, mas so
-- passam a valer dinheiro na Etapa 3, quando o place_trade for religado.
--
-- Dois tipos:
--   PAYOUT   — soma pontos percentuais ao payout (ex: +7 => 85% vira 92%).
--   CASHBACK — devolve valor fixo em saldo BONUS quando um gatilho dispara.
--
-- Frontend: apps/web/src/app/admin/boosters/page.tsx

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Campanhas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.boosters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('PAYOUT','CASHBACK')),
  enabled        boolean NOT NULL DEFAULT false,

  -- PAYOUT: pontos percentuais somados ao payout base (ex: 7).
  -- CASHBACK: valor fixo devolvido em saldo bonus, em R$.
  value          numeric NOT NULL CHECK (value > 0),

  -- Travas de custo. NULL = sem trava (perigoso; o admin avisa na tela).
  max_stake      numeric CHECK (max_stake IS NULL OR max_stake > 0),  -- PAYOUT: entrada maxima que recebe o boost
  max_grants_per_user int CHECK (max_grants_per_user IS NULL OR max_grants_per_user > 0),

  -- Alcance. asset_scope NULL = todos os ativos.
  asset_scope    text[],

  -- Janela da campanha (NULL = sem limite).
  starts_at      timestamptz,
  ends_at        timestamptz,
  -- Happy hour diario dentro da janela (NULL = vale 24h). Horario de Brasilia.
  daily_start    time,
  daily_end      time,

  -- Gatilho automatico. NULL = campanha global (vale pra todo mundo na janela).
  trigger_event  text CHECK (trigger_event IN ('LOSS_STREAK','DEPOSIT','SIGNUP','INACTIVE_DAYS')),
  trigger_param  int,

  -- Concessao por evento: validade e quantas operacoes o booster cobre.
  grant_ttl_hours int NOT NULL DEFAULT 24 CHECK (grant_ttl_hours > 0),
  uses_per_grant  int NOT NULL DEFAULT 1  CHECK (uses_per_grant > 0),

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Campanha global precisa de janela; campanha por evento precisa de gatilho.
  CONSTRAINT boosters_scope_ck CHECK (
    (trigger_event IS NOT NULL) OR (starts_at IS NOT NULL AND ends_at IS NOT NULL)
  ),
  CONSTRAINT boosters_daily_ck CHECK (
    (daily_start IS NULL) = (daily_end IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS boosters_active_idx ON public.boosters (enabled, kind);

ALTER TABLE public.boosters ENABLE ROW LEVEL SECURITY;
-- Sem policy: leitura publica so pela RPC get_active_boost (SECURITY DEFINER).
REVOKE ALL ON public.boosters FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Concessoes (quem ganhou, quanto sobrou, quando expira)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booster_grants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booster_id   uuid NOT NULL REFERENCES public.boosters(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','USED','EXPIRED','REVOKED')),
  uses_left    int  NOT NULL DEFAULT 1,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  granted_by   text NOT NULL DEFAULT 'AUTO' CHECK (granted_by IN ('AUTO','ADMIN')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booster_grants_user_idx
  ON public.booster_grants (user_id, status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS booster_grants_booster_idx ON public.booster_grants (booster_id);

ALTER TABLE public.booster_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booster_grants FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Razao de custo — o que cada booster ja custou de verdade
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.booster_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booster_id   uuid NOT NULL REFERENCES public.boosters(id) ON DELETE CASCADE,
  grant_id     uuid REFERENCES public.booster_grants(id) ON DELETE SET NULL,
  user_id      uuid NOT NULL,
  operation_id uuid,
  kind         text NOT NULL CHECK (kind IN ('PAYOUT','CASHBACK')),
  -- Custo em R$ que este booster gerou (payout extra pago, ou cashback creditado).
  cost         numeric NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booster_ledger_booster_idx ON public.booster_ledger (booster_id, created_at DESC);

ALTER TABLE public.booster_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booster_ledger FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Teto duro global — protege contra erro de digitacao no admin.
--    Nenhum booster de payout pode levar o payout final acima disto.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.app_config (key, value)
VALUES ('boosterMaxPayoutPct', '95'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Resolucao do boost de payout (servidor e a unica fonte)
--    Retorna os pontos percentuais a somar. 0 = sem boost.
--    STABLE: pode ser chamada de dentro do place_trade sem custo relevante.
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
  -- Maior boost aplicavel vence (nao acumula campanhas).
  SELECT COALESCE(MAX(b.value), 0)
  FROM public.boosters b
  WHERE b.kind = 'PAYOUT'
    AND b.enabled = true
    -- janela da campanha
    AND (b.starts_at IS NULL OR now() >= b.starts_at)
    AND (b.ends_at   IS NULL OR now() <= b.ends_at)
    -- happy hour diario (horario de Brasilia); janela que cruza a meia-noite tambem vale
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
    -- escopo de ativo
    AND (b.asset_scope IS NULL OR p_asset_id = ANY (b.asset_scope))
    -- teto de entrada: acima disso a operacao nao recebe boost
    AND (p_amount IS NULL OR b.max_stake IS NULL OR p_amount <= b.max_stake)
    -- global (sem gatilho) vale pra todos; com gatilho exige concessao ativa
    AND (
      b.trigger_event IS NULL
      OR EXISTS (
        SELECT 1 FROM public.booster_grants g
        WHERE g.booster_id = b.id
          AND g.user_id = p_user_id
          AND g.status = 'ACTIVE'
          AND g.uses_left > 0
          AND (g.expires_at IS NULL OR g.expires_at > now())
      )
    );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Leitura publica — o app do usuario precisa saber que existe boost pra exibir.
--    Nao expoe custo, gatilho nem nada interno.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_boost()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_row public.boosters;
BEGIN
  SELECT b.* INTO v_row
  FROM public.boosters b
  WHERE b.kind = 'PAYOUT'
    AND b.enabled = true
    AND b.trigger_event IS NULL                       -- so campanha global aparece pra todos
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
  ORDER BY b.value DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN json_build_object('active', false); END IF;

  RETURN json_build_object(
    'active',      true,
    'name',        v_row.name,
    'boost_pct',   v_row.value,
    'asset_scope', v_row.asset_scope,
    'max_stake',   v_row.max_stake,
    'ends_at',     v_row.ends_at,
    'daily_end',   v_row.daily_end
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) RPCs admin
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
    'max_payout_cap', COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config WHERE key='boosterMaxPayoutPct'), 95),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'kind', b.kind, 'enabled', b.enabled,
        'value', b.value, 'max_stake', b.max_stake,
        'max_grants_per_user', b.max_grants_per_user,
        'asset_scope', b.asset_scope,
        'starts_at', b.starts_at, 'ends_at', b.ends_at,
        'daily_start', b.daily_start, 'daily_end', b.daily_end,
        'trigger_event', b.trigger_event, 'trigger_param', b.trigger_param,
        'grant_ttl_hours', b.grant_ttl_hours, 'uses_per_grant', b.uses_per_grant,
        'created_at', b.created_at,
        -- quantos usuarios estao com este booster ativo agora
        'active_grants', (
          SELECT count(*) FROM public.booster_grants g
          WHERE g.booster_id = b.id AND g.status = 'ACTIVE'
            AND (g.expires_at IS NULL OR g.expires_at > now())
        ),
        -- custo real ja acumulado
        'total_cost', COALESCE((SELECT sum(l.cost) FROM public.booster_ledger l WHERE l.booster_id = b.id), 0)
      ) ORDER BY b.enabled DESC, b.created_at DESC)
      FROM public.boosters b
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_booster(
  p_id                  uuid,
  p_name                text,
  p_kind                text,
  p_value               numeric,
  p_max_stake           numeric DEFAULT NULL,
  p_max_grants_per_user int     DEFAULT NULL,
  p_asset_scope         text[]  DEFAULT NULL,
  p_starts_at           timestamptz DEFAULT NULL,
  p_ends_at             timestamptz DEFAULT NULL,
  p_daily_start         time    DEFAULT NULL,
  p_daily_end           time    DEFAULT NULL,
  p_trigger_event       text    DEFAULT NULL,
  p_trigger_param       int     DEFAULT NULL,
  p_grant_ttl_hours     int     DEFAULT 24,
  p_uses_per_grant      int     DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_id     uuid;
  v_before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome obrigatório'; END IF;
  IF p_kind NOT IN ('PAYOUT','CASHBACK') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF p_value IS NULL OR p_value <= 0 THEN RAISE EXCEPTION 'Valor deve ser maior que zero'; END IF;

  -- Guarda-corpo: boost de payout absurdo e quase sempre erro de digitacao.
  -- (O teto do payout FINAL e o app_config.boosterMaxPayoutPct, aplicado no place_trade.)
  IF p_kind = 'PAYOUT' AND p_value > 30 THEN
    RAISE EXCEPTION 'Boost de payout acima de 30 pontos percentuais não é permitido (recebido: %)', p_value;
  END IF;

  -- Cashback sem teto de concessoes por usuario e passivo aberto.
  IF p_kind = 'CASHBACK' AND p_max_grants_per_user IS NULL THEN
    RAISE EXCEPTION 'Cashback exige limite de concessões por usuário';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT to_jsonb(b) INTO v_before FROM public.boosters b WHERE b.id = p_id;
  END IF;

  INSERT INTO public.boosters AS b (
    id, name, kind, value, max_stake, max_grants_per_user, asset_scope,
    starts_at, ends_at, daily_start, daily_end,
    trigger_event, trigger_param, grant_ttl_hours, uses_per_grant
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()), btrim(p_name), p_kind, p_value, p_max_stake,
    p_max_grants_per_user, p_asset_scope,
    p_starts_at, p_ends_at, p_daily_start, p_daily_end,
    p_trigger_event, p_trigger_param, COALESCE(p_grant_ttl_hours, 24), COALESCE(p_uses_per_grant, 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, kind = EXCLUDED.kind, value = EXCLUDED.value,
    max_stake = EXCLUDED.max_stake, max_grants_per_user = EXCLUDED.max_grants_per_user,
    asset_scope = EXCLUDED.asset_scope,
    starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    daily_start = EXCLUDED.daily_start, daily_end = EXCLUDED.daily_end,
    trigger_event = EXCLUDED.trigger_event, trigger_param = EXCLUDED.trigger_param,
    grant_ttl_hours = EXCLUDED.grant_ttl_hours, uses_per_grant = EXCLUDED.uses_per_grant,
    updated_at = now()
  RETURNING b.id INTO v_id;

  PERFORM public.log_admin_action(
    CASE WHEN v_before IS NULL THEN 'create_booster' ELSE 'update_booster' END,
    'booster', v_id, v_before,
    (SELECT to_jsonb(b) FROM public.boosters b WHERE b.id = v_id), NULL);

  RETURN v_id;
END;
$function$;

-- Ligar/desligar e uma acao de dinheiro: fica separada e sempre auditada.
CREATE OR REPLACE FUNCTION public.admin_toggle_booster(p_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE v_before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT to_jsonb(b) INTO v_before FROM public.boosters b WHERE b.id = p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Booster não encontrado'; END IF;

  UPDATE public.boosters SET enabled = p_enabled, updated_at = now() WHERE id = p_id;

  PERFORM public.log_admin_action(
    CASE WHEN p_enabled THEN 'enable_booster' ELSE 'disable_booster' END,
    'booster', p_id, v_before,
    (SELECT to_jsonb(b) FROM public.boosters b WHERE b.id = p_id), NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_booster(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE v_before jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT to_jsonb(b) INTO v_before FROM public.boosters b WHERE b.id = p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Booster não encontrado'; END IF;

  IF (v_before->>'enabled')::boolean THEN
    RAISE EXCEPTION 'Desligue o booster antes de excluir';
  END IF;

  DELETE FROM public.boosters WHERE id = p_id;
  PERFORM public.log_admin_action('delete_booster', 'booster', p_id, v_before, NULL, NULL);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Permissoes — so authenticated, e as RPCs se auto-protegem com is_admin.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_list_boosters()                     FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_toggle_booster(uuid, boolean)       FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_delete_booster(uuid)                FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_booster(uuid,text,text,numeric,numeric,int,text[],timestamptz,timestamptz,time,time,text,int,int,int) FROM public, anon;
REVOKE ALL ON FUNCTION public.active_payout_boost(uuid, text, numeric)  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_boosters()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_booster(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_booster(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_booster(uuid,text,text,numeric,numeric,int,text[],timestamptz,timestamptz,time,time,text,int,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_boost()                  TO authenticated;
