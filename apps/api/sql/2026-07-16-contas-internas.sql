-- ═══════════════════════════════════════════════════════════════════════════
-- Contas internas — 16/07/2026
--
-- Problema: as contas de demonstração do time (janielmadeira*) entram em todas
-- as métricas do admin. Distorção medida antes desta migration:
--   Saldo Total Usuários: R$ 4.516,89 mostrado  →  R$ 1.930,10 real (57% era interno)
--   Total Usuários:       133 mostrado          →  130 real
--
-- Solução: profiles.is_internal. A conta continua funcionando 100% normal
-- (opera, deposita, saca) e continua aparecendo na lista de Usuários com um
-- selo — só some das SOMAS.
--
-- Depósitos já tinham escape via deposits.is_fake; isto cobre o resto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Coluna ──────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_internal boolean not null default false;

comment on column public.profiles.is_internal is
  'Conta interna do time (demonstração/teste). Excluída de toda métrica agregada do admin. A conta funciona normalmente.';

-- Índice parcial: só as poucas linhas internas entram nele.
create index if not exists profiles_is_internal_idx
  on public.profiles (id) where is_internal;


-- ── 2. RPC para marcar/desmarcar ───────────────────────────────────────────
create or replace function public.admin_set_internal(
  p_user_id uuid, p_is_internal boolean, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_before boolean;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso negado'; end if;

  select is_internal into v_before from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Usuário não encontrado'; end if;
  if v_before = p_is_internal then return; end if;  -- idempotente

  update public.profiles set is_internal = p_is_internal where id = p_user_id;

  perform public.log_admin_action('set_internal', 'user', p_user_id,
    jsonb_build_object('is_internal', v_before),
    jsonb_build_object('is_internal', p_is_internal),
    p_reason);
end;
$function$;

-- Fecha para anon/PUBLIC (lição da auditoria de 16/07: 38 RPCs estavam com
-- EXECUTE aberto para anon — inofensivo por causa do gate is_admin, mas é
-- superfície à toa). Só authenticated + service_role.
revoke all on function public.admin_set_internal(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_internal(uuid, boolean, text) to authenticated, service_role;


-- ── 3. Dashboard principal ─────────────────────────────────────────────────
create or replace function public.admin_dashboard_stats(p_period text default '30d'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
DECLARE
  v_from              timestamptz;
  v_to                timestamptz;
  v_total_deposits    numeric;
  v_total_withdrawals numeric;
  v_dep_count         int;
  v_avg_ticket        numeric;
  v_user_balance      numeric;
  v_user_bonus        numeric;
  v_total_users       int;
  v_new_users         int;
  v_total_wagered     numeric;
  v_platform_gains    numeric;   -- user perdeu (profit < 0)
  v_platform_losses   numeric;   -- user ganhou (profit > 0)
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT p_from, p_to INTO v_from, v_to FROM public._period_range(p_period);

  -- Depósitos no período (confirmados, não-fake, conta não-interna)
  SELECT COALESCE(SUM(d.amount), 0), count(*)
  INTO v_total_deposits, v_dep_count
  FROM public.deposits d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE d.status = 'confirmed' AND d.is_fake = false AND NOT p.is_internal
    AND d.confirmed_at >= v_from AND d.confirmed_at < v_to;

  -- Saques pagos no período (conta não-interna)
  SELECT COALESCE(SUM(w.amount), 0)
  INTO v_total_withdrawals
  FROM public.withdrawals w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE w.status = 'paid' AND NOT p.is_internal
    AND w.paid_at >= v_from AND w.paid_at < v_to;

  v_avg_ticket := CASE WHEN v_dep_count > 0 THEN v_total_deposits / v_dep_count ELSE 0 END;

  -- Saldo / bônus de TODAS as contas REAL não-internas (não filtra período)
  SELECT COALESCE(SUM(a.balance), 0) INTO v_user_balance
  FROM public.accounts a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE a.type = 'REAL' AND NOT p.is_internal;

  SELECT COALESCE(SUM(bonus_balance), 0) INTO v_user_bonus
  FROM public.profiles WHERE NOT is_internal;

  -- Total de usuários e novos no período
  SELECT count(*) INTO v_total_users FROM public.profiles WHERE NOT is_internal;
  SELECT count(*) INTO v_new_users   FROM public.profiles
    WHERE NOT is_internal AND created_at >= v_from AND created_at < v_to;

  -- Operações no período em contas REAL não-internas (fechadas, não estornadas)
  WITH ops AS (
    SELECT o.amount, o.profit
    FROM public.operations o
    JOIN public.accounts a ON a.id = o.account_id
    JOIN public.profiles p ON p.id = a.user_id
    WHERE a.type = 'REAL'
      AND NOT p.is_internal
      AND o.status = 'closed'
      AND o.created_at >= v_from AND o.created_at < v_to
  )
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(ABS(SUM(profit) FILTER (WHERE profit < 0)), 0),
    COALESCE(SUM(profit) FILTER (WHERE profit > 0), 0)
  INTO v_total_wagered, v_platform_gains, v_platform_losses
  FROM ops;

  RETURN jsonb_build_object(
    'total_deposits',     v_total_deposits,
    'total_withdrawals',  v_total_withdrawals,
    'avg_ticket',         v_avg_ticket,
    'net_flow',           v_total_deposits - v_total_withdrawals,
    'user_balance',       v_user_balance,
    'user_bonus',         v_user_bonus,
    'balance_and_bonus',  v_user_balance + v_user_bonus,
    'total_users',        v_total_users,
    'new_users',          v_new_users,
    'total_wagered',      v_total_wagered,
    'platform_gains',     v_platform_gains,
    'platform_losses',    v_platform_losses,
    'platform_result',    v_platform_gains - v_platform_losses
  );
END;
$function$;


-- ── 4. Cards da página Usuários ────────────────────────────────────────────
create or replace function public.admin_user_stats()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
DECLARE
  v_total       int;
  v_today       int;
  v_last_7d     int;
  v_last_30d    int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT count(*) INTO v_total    FROM public.profiles WHERE NOT is_internal;
  SELECT count(*) INTO v_today    FROM public.profiles WHERE NOT is_internal AND created_at >= date_trunc('day', now());
  SELECT count(*) INTO v_last_7d  FROM public.profiles WHERE NOT is_internal AND created_at >= now() - interval '7 days';
  SELECT count(*) INTO v_last_30d FROM public.profiles WHERE NOT is_internal AND created_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'total',    v_total,
    'today',    v_today,
    'last_7d',  v_last_7d,
    'last_30d', v_last_30d
  );
END;
$function$;


-- ── 5. Página Carteira ─────────────────────────────────────────────────────
create or replace function public.admin_wallet_overview()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT jsonb_build_object(
    'real_balance',        COALESCE((SELECT sum(a.balance) FROM public.accounts a
                                      JOIN public.profiles p ON p.id = a.user_id
                                     WHERE a.type='REAL' AND NOT p.is_internal),0),
    'demo_balance',        COALESCE((SELECT sum(a.balance) FROM public.accounts a
                                      JOIN public.profiles p ON p.id = a.user_id
                                     WHERE a.type='DEMO' AND NOT p.is_internal),0),
    'bonus_balance',       COALESCE((SELECT sum(bonus_balance) FROM public.profiles
                                     WHERE NOT is_internal),0),
    'deposits_confirmed',  COALESCE((SELECT sum(d.amount) FROM public.deposits d
                                      JOIN public.profiles p ON p.id = d.user_id
                                     WHERE d.status='confirmed' AND COALESCE(d.is_fake,false)=false
                                       AND NOT p.is_internal),0),
    'deposits_pending',    COALESCE((SELECT sum(d.amount) FROM public.deposits d
                                      JOIN public.profiles p ON p.id = d.user_id
                                     WHERE d.status='pending' AND NOT p.is_internal),0),
    'withdrawals_paid',    COALESCE((SELECT sum(w.amount) FROM public.withdrawals w
                                      JOIN public.profiles p ON p.id = w.user_id
                                     WHERE w.status='paid' AND NOT p.is_internal),0),
    'withdrawals_pending', COALESCE((SELECT sum(w.amount) FROM public.withdrawals w
                                      JOIN public.profiles p ON p.id = w.user_id
                                     WHERE w.status='pending' AND NOT p.is_internal),0),
    'open_exposure',       COALESCE((SELECT sum(o.amount) FROM public.operations o
                                      JOIN public.accounts a ON a.id = o.account_id
                                      JOIN public.profiles p ON p.id = a.user_id
                                     WHERE o.status='OPEN' AND NOT p.is_internal),0),
    'users_count',         (SELECT count(*) FROM public.profiles WHERE NOT is_internal),
    'real_accounts',       (SELECT count(*) FROM public.accounts a
                              JOIN public.profiles p ON p.id = a.user_id
                             WHERE a.type='REAL' AND NOT p.is_internal)
  ) INTO v;

  v := v || jsonb_build_object(
    'net_deposits', (v->>'deposits_confirmed')::numeric - (v->>'withdrawals_paid')::numeric
  );

  RETURN v;
END;
$function$;


-- ── 6. Gráfico de usuários ativos ──────────────────────────────────────────
create or replace function public.admin_dashboard_active_users(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  WITH days AS (
    SELECT generate_series(
      date_trunc('day', now() - (p_days - 1) * interval '1 day'),
      date_trunc('day', now()),
      interval '1 day'
    ) AS day
  ),
  active AS (
    SELECT date_trunc('day', o.created_at) AS day, count(DISTINCT a.user_id) AS users
    FROM public.operations o
    JOIN public.accounts a ON a.id = o.account_id
    JOIN public.profiles p ON p.id = a.user_id
    WHERE o.created_at >= now() - (p_days * interval '1 day')
      AND NOT p.is_internal
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day',   to_char(d.day, 'DD/MM'),
    'users', COALESCE(active.users, 0)
  ) ORDER BY d.day), '[]'::jsonb) INTO v_rows
  FROM days d
  LEFT JOIN active ON active.day = d.day;

  RETURN v_rows;
END;
$function$;


-- ── 7. Lista de usuários — devolve is_internal p/ o selo ───────────────────
create or replace function public.admin_list_users(
  p_search text default null::text, p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
DECLARE
  v_total int;
  v_rows  jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Total filtrado (a lista MOSTRA contas internas — só as somas as excluem)
  SELECT count(*)
  INTO v_total
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p_search IS NULL OR p_search = ''
     OR p.name  ILIKE '%' || p_search || '%'
     OR u.email ILIKE '%' || p_search || '%';

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at_sort DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.created_at AS created_at_sort,
      jsonb_build_object(
        'id',                  p.id,
        'name',                p.name,
        'email',               u.email,
        'kyc_status',          p.kyc_status,
        'bonus_balance',       p.bonus_balance,
        'rollover_required',   p.rollover_required,
        'rollover_completed',  p.rollover_completed,
        'blocked_at',          p.blocked_at,
        'is_admin',            EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = p.id),
        'is_internal',         p.is_internal,
        'real_balance',        COALESCE((SELECT balance FROM public.accounts WHERE user_id = p.id AND type = 'REAL' LIMIT 1), 0),
        'demo_balance',        COALESCE((SELECT balance FROM public.accounts WHERE user_id = p.id AND type = 'DEMO' LIMIT 1), 0),
        'created_at',          p.created_at
      ) AS row_data
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p_search IS NULL OR p_search = ''
       OR p.name  ILIKE '%' || p_search || '%'
       OR u.email ILIKE '%' || p_search || '%'
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;
