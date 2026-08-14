-- ═══════════════════════════════════════════════════════════════════════════
-- Correção de métricas do admin + upgrade da tela de Usuários — 17/07/2026
--
-- JÁ APLICADO EM PRODUÇÃO via MCP do Supabase. Este arquivo é o registro
-- versionado para o repo não divergir do banco.
--
-- Contexto: enquanto montávamos a tela de Usuários, a investigação revelou dois
-- bugs de dados que deixavam o Dashboard mentindo:
--
--   1. STATUS EM MINÚSCULO. As funções de dashboard comparavam o status das
--      operações com 'closed'/'open'/'voided', mas o motor grava MAIÚSCULO
--      (WON/LOST/DRAW/OPEN/VOIDED). Resultado: Volume, Ganhos, Perdas, Resultado
--      da Plataforma e os gráficos sempre devolveram ZERO. Nunca funcionaram.
--
--   2. PROFIT ZERADO NA DERROTA. O motor OTC (apps/api/src/operations/service.ts)
--      gravava profit=0 nas derrotas em vez de -amount. Como o P&L da casa é
--      SUM(profit<0), metade do lucro sumia do relatório. Corrigido no TS
--      (service.ts) + backfill abaixo. IMPORTANTE: o saldo dos usuários NUNCA
--      foi afetado — na derrota o stake já sai na abertura, sem lançamento extra.
--
-- Além disso: admin_list_users ganhou métricas por usuário (depositado, volume,
-- ops, resultado, saldo, últ. op) e ordenação por qualquer coluna; e a trava
-- FOR UPDATE do P1-2 da auditoria (estorno duplo de saque).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Backfill das derrotas com profit zerado ────────────────────────────────
-- Seguro: derrota com profit=0 só existe por causa do bug; DRAW fica de fora
-- pelo filtro de status; nenhuma linha-alvo teve saída antecipada (verificado).
update public.operations set profit = -amount where status = 'LOST' and profit = 0;


-- ── 1. Dashboard: stats principais ─────────────────────────────────────────
create or replace function public.admin_dashboard_stats(p_period text default '30d'::text)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE
  v_from timestamptz; v_to timestamptz;
  v_total_deposits numeric; v_total_withdrawals numeric; v_dep_count int; v_avg_ticket numeric;
  v_user_balance numeric; v_user_bonus numeric; v_total_users int; v_new_users int;
  v_total_wagered numeric; v_platform_gains numeric; v_platform_losses numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT p_from, p_to INTO v_from, v_to FROM public._period_range(p_period);

  SELECT COALESCE(SUM(d.amount), 0), count(*) INTO v_total_deposits, v_dep_count
  FROM public.deposits d JOIN public.profiles p ON p.id = d.user_id
  WHERE d.status = 'confirmed' AND d.is_fake = false AND NOT p.is_internal
    AND d.confirmed_at >= v_from AND d.confirmed_at < v_to;

  SELECT COALESCE(SUM(w.amount), 0) INTO v_total_withdrawals
  FROM public.withdrawals w JOIN public.profiles p ON p.id = w.user_id
  WHERE w.status = 'paid' AND NOT p.is_internal AND w.paid_at >= v_from AND w.paid_at < v_to;

  v_avg_ticket := CASE WHEN v_dep_count > 0 THEN v_total_deposits / v_dep_count ELSE 0 END;

  SELECT COALESCE(SUM(a.balance), 0) INTO v_user_balance
  FROM public.accounts a JOIN public.profiles p ON p.id = a.user_id
  WHERE a.type = 'REAL' AND NOT p.is_internal;

  SELECT COALESCE(SUM(bonus_balance), 0) INTO v_user_bonus FROM public.profiles WHERE NOT is_internal;

  SELECT count(*) INTO v_total_users FROM public.profiles WHERE NOT is_internal;
  SELECT count(*) INTO v_new_users FROM public.profiles
    WHERE NOT is_internal AND created_at >= v_from AND created_at < v_to;

  WITH ops AS (
    SELECT o.amount, o.profit
    FROM public.operations o
    JOIN public.accounts a ON a.id = o.account_id
    JOIN public.profiles p ON p.id = a.user_id
    WHERE a.type = 'REAL' AND NOT p.is_internal
      AND o.status IN ('WON','LOST','DRAW')   -- era 'closed' (nunca casava)
      AND o.created_at >= v_from AND o.created_at < v_to
  )
  SELECT COALESCE(SUM(amount), 0),
         COALESCE(ABS(SUM(profit) FILTER (WHERE profit < 0)), 0),
         COALESCE(SUM(profit) FILTER (WHERE profit > 0), 0)
  INTO v_total_wagered, v_platform_gains, v_platform_losses FROM ops;

  RETURN jsonb_build_object(
    'total_deposits', v_total_deposits, 'total_withdrawals', v_total_withdrawals,
    'avg_ticket', v_avg_ticket, 'net_flow', v_total_deposits - v_total_withdrawals,
    'user_balance', v_user_balance, 'user_bonus', v_user_bonus,
    'balance_and_bonus', v_user_balance + v_user_bonus,
    'total_users', v_total_users, 'new_users', v_new_users,
    'total_wagered', v_total_wagered, 'platform_gains', v_platform_gains,
    'platform_losses', v_platform_losses, 'platform_result', v_platform_gains - v_platform_losses
  );
END;
$function$;


-- ── 2. Dashboard: série de performance diária ──────────────────────────────
create or replace function public.admin_dashboard_perf_series(p_days integer default 7)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  WITH days AS (
    SELECT generate_series(date_trunc('day', now() - (p_days - 1) * interval '1 day'),
                           date_trunc('day', now()), interval '1 day') AS day
  ),
  dep AS (
    SELECT date_trunc('day', d.confirmed_at) AS day, SUM(d.amount) AS amount
    FROM public.deposits d JOIN public.profiles p ON p.id = d.user_id
    WHERE d.status='confirmed' AND d.is_fake=false AND NOT p.is_internal
      AND d.confirmed_at >= now() - (p_days * interval '1 day') GROUP BY 1
  ),
  wdr AS (
    SELECT date_trunc('day', w.paid_at) AS day, SUM(w.amount) AS amount
    FROM public.withdrawals w JOIN public.profiles p ON p.id = w.user_id
    WHERE w.status='paid' AND NOT p.is_internal
      AND w.paid_at >= now() - (p_days * interval '1 day') GROUP BY 1
  ),
  ops AS (
    SELECT date_trunc('day', o.created_at) AS day,
           COALESCE(ABS(SUM(o.profit) FILTER (WHERE o.profit < 0)), 0) AS gains,
           COALESCE(SUM(o.profit) FILTER (WHERE o.profit > 0), 0)      AS losses
    FROM public.operations o
    JOIN public.accounts a ON a.id = o.account_id
    JOIN public.profiles p ON p.id = a.user_id
    WHERE a.type='REAL' AND NOT p.is_internal
      AND o.status IN ('WON','LOST','DRAW')
      AND o.created_at >= now() - (p_days * interval '1 day') GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', to_char(d.day, 'DD/MM'),
    'deposits', COALESCE(dep.amount, 0), 'withdrawals', COALESCE(wdr.amount, 0),
    'gains', COALESCE(ops.gains, 0), 'losses', COALESCE(ops.losses, 0),
    'result', COALESCE(ops.gains, 0) - COALESCE(ops.losses, 0)
  ) ORDER BY d.day), '[]'::jsonb) INTO v_rows
  FROM days d LEFT JOIN dep ON dep.day=d.day LEFT JOIN wdr ON wdr.day=d.day LEFT JOIN ops ON ops.day=d.day;
  RETURN v_rows;
END;
$function$;


-- ── 3. Dashboard: distribuição de resultados ───────────────────────────────
create or replace function public.admin_dashboard_result_distribution(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE v_won int; v_lost int; v_void int; v_total int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT
    count(*) FILTER (WHERE o.status='WON'),
    count(*) FILTER (WHERE o.status='LOST'),
    count(*) FILTER (WHERE o.status='VOIDED')
  INTO v_won, v_lost, v_void
  FROM public.operations o
  JOIN public.accounts a ON a.id = o.account_id
  JOIN public.profiles p ON p.id = a.user_id
  WHERE a.type='REAL' AND NOT p.is_internal
    AND o.created_at >= now() - (p_days * interval '1 day');
  v_total := v_won + v_lost + v_void;
  RETURN jsonb_build_array(
    jsonb_build_object('name','Ganhos','value',v_won,'pct',CASE WHEN v_total>0 THEN ROUND((v_won::numeric/v_total)*100,1) ELSE 0 END,'color','#22c55e'),
    jsonb_build_object('name','Perdas','value',v_lost,'pct',CASE WHEN v_total>0 THEN ROUND((v_lost::numeric/v_total)*100,1) ELSE 0 END,'color','#ef4444'),
    jsonb_build_object('name','Estornadas','value',v_void,'pct',CASE WHEN v_total>0 THEN ROUND((v_void::numeric/v_total)*100,1) ELSE 0 END,'color','#6b7280')
  );
END;
$function$;


-- ── 4. Detalhe do usuário (total ganho / perdido) ──────────────────────────
create or replace function public.admin_get_user_details(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE
  v_user jsonb; v_operations jsonb;
  v_total_won numeric; v_total_lost numeric; v_total_dep numeric;
  v_real_bal numeric; v_real_acc_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT id, balance INTO v_real_acc_id, v_real_bal
  FROM public.accounts WHERE user_id = p_user_id AND type = 'REAL' LIMIT 1;

  SELECT COALESCE(SUM(profit) FILTER (WHERE profit > 0), 0),
         COALESCE(ABS(SUM(profit) FILTER (WHERE profit < 0)), 0)
  INTO v_total_won, v_total_lost
  FROM public.operations
  WHERE account_id = v_real_acc_id AND status IN ('WON','LOST','DRAW');

  SELECT COALESCE(SUM(amount), 0) INTO v_total_dep
  FROM public.deposits WHERE user_id = p_user_id AND status = 'confirmed';

  SELECT jsonb_build_object(
    'id', p.id, 'name', p.name, 'email', u.email, 'cpf', p.cpf, 'phone', p.phone,
    'kyc_status', p.kyc_status, 'blocked_at', p.blocked_at, 'blocked_reason', p.blocked_reason,
    'bonus_balance', p.bonus_balance, 'rollover_required', p.rollover_required,
    'rollover_completed', p.rollover_completed, 'custom_payout_forex', p.custom_payout_forex,
    'custom_payout_otc', p.custom_payout_otc, 'custom_payout_crypto', p.custom_payout_crypto,
    'created_at', p.created_at,
    'is_admin', EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p.id)
  ) INTO v_user
  FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.id = p_user_id;

  WITH recent_ops AS (
    SELECT o.* FROM public.operations o WHERE o.account_id = v_real_acc_id
    ORDER BY o.created_at DESC LIMIT 50
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'asset_symbol', asset_symbol, 'direction', direction, 'amount', amount,
    'entry_price', entry_price, 'exit_price', exit_price, 'profit', profit,
    'status', status, 'created_at', created_at, 'closed_at', closed_at
  )), '[]'::jsonb) INTO v_operations FROM recent_ops;

  RETURN jsonb_build_object(
    'user', v_user, 'real_balance', COALESCE(v_real_bal, 0),
    'total_won', v_total_won, 'total_lost', v_total_lost,
    'total_deposited', v_total_dep, 'operations', v_operations
  );
END;
$function$;


-- ── 5. Lista de operações (filtros open/voided/won/lost) ───────────────────
create or replace function public.admin_list_operations(p_search text default null::text, p_filter text default 'all'::text, p_account text default 'all'::text, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE v_total int; v_rows jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  WITH base AS (
    SELECT o.id, o.asset_id, o.asset_symbol, o.direction, o.amount, o.payout_pct,
      o.entry_price, o.exit_price, o.status, o.profit, o.created_at, o.expires_at, o.closed_at,
      o.modified_by_admin, o.modified_at, o.admin_notes,
      a.type AS account_type, a.user_id, p.name AS user_name, u.email AS user_email,
      EXTRACT(EPOCH FROM (o.expires_at - o.created_at))::int AS duration_seconds
    FROM public.operations o
    JOIN public.accounts a ON a.id = o.account_id
    JOIN public.profiles p ON p.id = a.user_id
    JOIN auth.users u ON u.id = a.user_id
    WHERE (p_search IS NULL OR p_search = '' OR p.name ILIKE '%'||p_search||'%'
        OR u.email ILIKE '%'||p_search||'%' OR o.asset_symbol ILIKE '%'||p_search||'%')
      AND (p_account = 'all' OR a.type = p_account)
      AND (p_filter = 'all'
        OR (p_filter = 'open'     AND o.status = 'OPEN')
        OR (p_filter = 'voided'   AND o.status = 'VOIDED')
        OR (p_filter = 'won'      AND o.status = 'WON')
        OR (p_filter = 'lost'     AND o.status = 'LOST')
        OR (p_filter = 'modified' AND o.modified_by_admin IS NOT NULL))
  )
  SELECT count(*) INTO v_total FROM base;

  WITH base AS (
    SELECT o.id, o.asset_id, o.asset_symbol, o.direction, o.amount, o.payout_pct,
      o.entry_price, o.exit_price, o.status, o.profit, o.created_at, o.expires_at, o.closed_at,
      o.modified_by_admin, o.modified_at, o.admin_notes,
      a.type AS account_type, a.user_id, p.name AS user_name, u.email AS user_email,
      EXTRACT(EPOCH FROM (o.expires_at - o.created_at))::int AS duration_seconds
    FROM public.operations o
    JOIN public.accounts a ON a.id = o.account_id
    JOIN public.profiles p ON p.id = a.user_id
    JOIN auth.users u ON u.id = a.user_id
    WHERE (p_search IS NULL OR p_search = '' OR p.name ILIKE '%'||p_search||'%'
        OR u.email ILIKE '%'||p_search||'%' OR o.asset_symbol ILIKE '%'||p_search||'%')
      AND (p_account = 'all' OR a.type = p_account)
      AND (p_filter = 'all'
        OR (p_filter = 'open'     AND o.status = 'OPEN')
        OR (p_filter = 'voided'   AND o.status = 'VOIDED')
        OR (p_filter = 'won'      AND o.status = 'WON')
        OR (p_filter = 'lost'     AND o.status = 'LOST')
        OR (p_filter = 'modified' AND o.modified_by_admin IS NOT NULL))
    ORDER BY o.created_at DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'asset_id', asset_id, 'asset_symbol', asset_symbol, 'direction', direction,
    'amount', amount, 'payout_pct', payout_pct, 'entry_price', entry_price, 'exit_price', exit_price,
    'status', status, 'profit', profit, 'created_at', created_at, 'expires_at', expires_at,
    'closed_at', closed_at, 'account_type', account_type, 'user_id', user_id,
    'user_name', user_name, 'user_email', user_email, 'duration_seconds', duration_seconds,
    'modified_by_admin', modified_by_admin, 'modified_at', modified_at, 'admin_notes', admin_notes
  )), '[]'::jsonb) INTO v_rows FROM base;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;


-- ── 6. Lista de usuários: métricas + ordenação ─────────────────────────────
-- Remove a versão antiga de 3 args (substituída pela de 5). p_sort passa por
-- whitelist e vira %I no format — nunca vai texto cru do cliente pro SQL.
drop function if exists public.admin_list_users(text, integer, integer);

create or replace function public.admin_list_users(
  p_search text default null::text, p_limit integer default 50, p_offset integer default 0,
  p_sort text default 'created_at'::text, p_dir text default 'desc'::text
)
returns jsonb language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE v_result jsonb; v_col text; v_dir text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  v_col := CASE p_sort
             WHEN 'name' THEN 'name' WHEN 'email' THEN 'email'
             WHEN 'deposited' THEN 'deposited' WHEN 'deposits_count' THEN 'deposits_count'
             WHEN 'withdrawn' THEN 'withdrawn'
             WHEN 'net_house' THEN 'net_house' WHEN 'volume' THEN 'volume'
             WHEN 'ops_count' THEN 'ops_count' WHEN 'user_result' THEN 'user_result'
             WHEN 'real_balance' THEN 'real_balance' WHEN 'bonus_balance' THEN 'bonus_balance'
             WHEN 'first_deposit_at' THEN 'first_deposit_at' WHEN 'last_op_at' THEN 'last_op_at'
             ELSE 'created_at'
           END;
  v_dir := CASE WHEN lower(coalesce(p_dir,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  EXECUTE format($q$
    WITH dep AS (
      SELECT a.user_id, sum(d.amount) AS v, count(*) AS n, min(d.confirmed_at) AS primeiro
      FROM public.deposits d JOIN public.accounts a ON a.id = d.account_id
      WHERE d.status = 'confirmed' AND coalesce(d.is_fake,false) = false GROUP BY 1
    ),
    saq AS (SELECT user_id, sum(amount) AS v FROM public.withdrawals WHERE status = 'paid' GROUP BY 1),
    ops AS (
      SELECT a.user_id, count(*) AS n, sum(o.amount) AS vol,
             sum(coalesce(o.profit,0)) AS lucro, max(o.created_at) AS ult
      FROM public.operations o JOIN public.accounts a ON a.id = o.account_id
      WHERE a.type = 'REAL' GROUP BY 1
    ),
    base AS (
      SELECT p.id, p.name, u.email, p.kyc_status, p.created_at,
        p.bonus_balance, p.rollover_required, p.rollover_completed, p.blocked_at, p.is_internal,
        EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = p.id) AS is_admin,
        coalesce((SELECT balance FROM public.accounts WHERE user_id = p.id AND type='REAL' LIMIT 1),0) AS real_balance,
        coalesce((SELECT balance FROM public.accounts WHERE user_id = p.id AND type='DEMO' LIMIT 1),0) AS demo_balance,
        coalesce(dep.v,0) AS deposited, coalesce(dep.n,0) AS deposits_count,
        coalesce(saq.v,0) AS withdrawn,
        coalesce(dep.v,0) - coalesce(saq.v,0) AS net_house,
        coalesce(ops.vol,0) AS volume, coalesce(ops.n,0) AS ops_count,
        coalesce(ops.lucro,0) AS user_result,
        dep.primeiro AS first_deposit_at, ops.ult AS last_op_at
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN dep ON dep.user_id = p.id
      LEFT JOIN saq ON saq.user_id = p.id
      LEFT JOIN ops ON ops.user_id = p.id
      WHERE $3 IS NULL OR $3 = '' OR p.name ILIKE '%%' || $3 || '%%' OR u.email ILIKE '%%' || $3 || '%%'
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM base),
      'rows',  COALESCE((SELECT jsonb_agg(to_jsonb(t))
                         FROM (SELECT * FROM base ORDER BY %I %s NULLS LAST, id LIMIT $1 OFFSET $2) t),
                        '[]'::jsonb)
    )
  $q$, v_col, v_dir)
  INTO v_result USING p_limit, p_offset, p_search;

  RETURN v_result;
END;
$function$;


-- ── 7. P1-2 da auditoria: trava contra estorno duplo de saque ──────────────
-- admin_process_withdrawal e admin_mark_withdrawal_paid liam a linha sem
-- FOR UPDATE. Duas rejeições simultâneas do mesmo saque estornavam em dobro.
create or replace function public.admin_process_withdrawal(p_withdrawal_id uuid, p_action text, p_notes text default null::text)
returns void language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE v_w withdrawals%ROWTYPE; v_kyc text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT * INTO v_w FROM public.withdrawals
  WHERE id = p_withdrawal_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retirada não encontrada ou já processada'; END IF;

  IF p_action = 'approve' THEN
    PERFORM public.require_recent_mfa(300);
    SELECT kyc_status INTO v_kyc FROM public.profiles WHERE id = v_w.user_id;
    IF v_kyc <> 'verified' THEN
      RAISE EXCEPTION 'Usuário precisa estar com KYC verificado antes de aprovar saque (atual: %)', v_kyc;
    END IF;
    UPDATE public.withdrawals SET status = 'approved', admin_notes = p_notes, processed_at = now()
    WHERE id = p_withdrawal_id;
    PERFORM public.log_admin_action('approve_withdrawal','withdrawal', p_withdrawal_id,
      jsonb_build_object('status','pending','amount',v_w.amount),
      jsonb_build_object('status','approved'), p_notes);
  ELSIF p_action = 'reject' THEN
    UPDATE public.withdrawals SET status = 'rejected', admin_notes = p_notes, processed_at = now()
    WHERE id = p_withdrawal_id;
    UPDATE public.accounts SET balance = balance + v_w.amount WHERE id = v_w.account_id;
    PERFORM public.log_admin_action('reject_withdrawal','withdrawal', p_withdrawal_id,
      jsonb_build_object('status','pending','amount',v_w.amount),
      jsonb_build_object('status','rejected','refunded',v_w.amount), p_notes);
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;
END;
$function$;

create or replace function public.admin_mark_withdrawal_paid(p_withdrawal_id uuid, p_payment_proof_id text, p_notes text default null::text)
returns void language plpgsql security definer set search_path to 'public', 'auth'
as $function$
DECLARE v_w withdrawals%ROWTYPE;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  PERFORM public.require_recent_mfa(300);
  IF p_payment_proof_id IS NULL OR length(trim(p_payment_proof_id)) < 3 THEN
    RAISE EXCEPTION 'ID do comprovante PIX obrigatório (mín. 3 caracteres)';
  END IF;
  SELECT * INTO v_w FROM public.withdrawals
  WHERE id = p_withdrawal_id AND status = 'approved'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saque precisa estar com status "approved" antes de marcar como pago';
  END IF;
  UPDATE public.withdrawals SET
    status = 'paid', paid_at = now(), paid_by_admin = auth.uid(),
    payment_proof_id = p_payment_proof_id, payment_notes = p_notes
  WHERE id = p_withdrawal_id;
  PERFORM public.log_admin_action('mark_withdrawal_paid','withdrawal', p_withdrawal_id,
    jsonb_build_object('status','approved'),
    jsonb_build_object('status','paid','proof_id',p_payment_proof_id,'amount',v_w.amount), p_notes);
END;
$function$;
