-- Admin / Carteira — DDL aplicado em producao (Supabase yilmbwrfaljxgvsygmyz) em 2026-06-14.
-- Aplicado via Supabase MCP (apply_migration). Este arquivo e o REGISTRO do que foi rodado.
--
-- Adiciona a visao de tesouraria (admin_wallet_overview) e a razao global de transacoes
-- (admin_list_transactions) consumidas por apps/web/src/app/admin/carteira/page.tsx.
-- Ambas SECURITY DEFINER, validam is_admin(auth.uid()) internamente (padrao dos demais admin_*).
-- O ajuste de saldo na pagina reusa o RPC ja existente admin_adjust_balance.

-- 1) Visao agregada (tesouraria)
CREATE OR REPLACE FUNCTION public.admin_wallet_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT jsonb_build_object(
    'real_balance',        COALESCE((SELECT sum(balance)       FROM public.accounts WHERE type='REAL'),0),
    'demo_balance',        COALESCE((SELECT sum(balance)       FROM public.accounts WHERE type='DEMO'),0),
    'bonus_balance',       COALESCE((SELECT sum(bonus_balance) FROM public.profiles),0),
    'deposits_confirmed',  COALESCE((SELECT sum(amount) FROM public.deposits    WHERE status='confirmed' AND COALESCE(is_fake,false)=false),0),
    'deposits_pending',    COALESCE((SELECT sum(amount) FROM public.deposits    WHERE status='pending'),0),
    'withdrawals_paid',    COALESCE((SELECT sum(amount) FROM public.withdrawals WHERE status='paid'),0),
    'withdrawals_pending', COALESCE((SELECT sum(amount) FROM public.withdrawals WHERE status='pending'),0),
    'open_exposure',       COALESCE((SELECT sum(amount) FROM public.operations  WHERE status='OPEN'),0),
    'users_count',         (SELECT count(*) FROM public.profiles),
    'real_accounts',       (SELECT count(*) FROM public.accounts WHERE type='REAL')
  ) INTO v;

  v := v || jsonb_build_object(
    'net_deposits', (v->>'deposits_confirmed')::numeric - (v->>'withdrawals_paid')::numeric
  );

  RETURN v;
END;
$function$;

-- 2) Razao global (tabela transactions) com nome/email do usuario, filtro por tipo, busca e paginacao
CREATE OR REPLACE FUNCTION public.admin_list_transactions(
  p_type   text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 25,
  p_offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_total int;
  v_rows  jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  WITH base AS (
    SELECT t.id, t.type, t.amount, t.description, t.operation_id, t.created_at,
           a.type AS account_type, a.user_id,
           p.name AS user_name, u.email AS user_email
    FROM public.transactions t
    JOIN public.accounts a ON a.id = t.account_id
    JOIN public.profiles p ON p.id = a.user_id
    JOIN auth.users   u ON u.id = a.user_id
    WHERE (p_type = 'all' OR t.type = p_type)
      AND (p_search IS NULL OR p_search = ''
           OR p.name        ILIKE '%'||p_search||'%'
           OR u.email       ILIKE '%'||p_search||'%'
           OR t.description ILIKE '%'||p_search||'%')
  )
  SELECT count(*) INTO v_total FROM base;

  WITH base AS (
    SELECT t.id, t.type, t.amount, t.description, t.operation_id, t.created_at,
           a.type AS account_type, a.user_id,
           p.name AS user_name, u.email AS user_email
    FROM public.transactions t
    JOIN public.accounts a ON a.id = t.account_id
    JOIN public.profiles p ON p.id = a.user_id
    JOIN auth.users   u ON u.id = a.user_id
    WHERE (p_type = 'all' OR t.type = p_type)
      AND (p_search IS NULL OR p_search = ''
           OR p.name        ILIKE '%'||p_search||'%'
           OR u.email       ILIKE '%'||p_search||'%'
           OR t.description ILIKE '%'||p_search||'%')
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           id,
    'type',         type,
    'amount',       amount,
    'description',  description,
    'operation_id', operation_id,
    'created_at',   created_at,
    'account_type', account_type,
    'user_id',      user_id,
    'user_name',    user_name,
    'user_email',   user_email
  )), '[]'::jsonb) INTO v_rows
  FROM base;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;

-- Permissoes: apenas usuarios autenticados podem invocar (a checagem de admin e interna)
REVOKE ALL ON FUNCTION public.admin_wallet_overview()                    FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_transactions(text,text,int,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_wallet_overview()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_transactions(text,text,int,int) TO authenticated;
