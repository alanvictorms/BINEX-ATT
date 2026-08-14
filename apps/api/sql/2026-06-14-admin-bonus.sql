-- Admin / Bônus — DDL aplicado em produção (Supabase yilmbwrfaljxgvsygmyz) 2026-06-14.
-- Aplicado via Supabase MCP (apply_migration). Este arquivo e o REGISTRO do que foi rodado.
--
-- Torna a regra do bonus de 1o deposito CONFIGURAVEL (era hardcoded em
-- grant_first_deposit_bonus: 100% / R$300 / 20x) e adiciona visao admin + revogacao.
-- Consumido por apps/web/src/app/admin/bonus/page.tsx.

-- 1) Seed das chaves de bonus (nao sobrescreve se ja existir)
INSERT INTO public.app_config (key, value) VALUES
  ('bonusFirstDepositEnabled',   'true'::jsonb),
  ('bonusFirstDepositPct',       '100'::jsonb),
  ('bonusFirstDepositMaxAmount', '300'::jsonb),
  ('bonusRolloverMultiplier',    '20'::jsonb),
  ('bonusMinDeposit',            '0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) admin_set_config: amplia a whitelist com as chaves de bonus
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
                   'bonusRolloverMultiplier','bonusMinDeposit') THEN
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

-- 3) grant_first_deposit_bonus: regra lida da config (mantem TODOS os guards e idempotencia)
CREATE OR REPLACE FUNCTION public.grant_first_deposit_bonus(p_deposit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dep     deposits%rowtype;
  v_prior   int;
  v_bonus   numeric;
  v_enabled boolean;
  v_pct     numeric;
  v_max     numeric;
  v_mult    numeric;
  v_min     numeric;
begin
  v_enabled := coalesce((select (value #>> '{}')::boolean from app_config where key='bonusFirstDepositEnabled'), true);
  if not v_enabled then return; end if;
  v_pct  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusFirstDepositPct'),       100);
  v_max  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusFirstDepositMaxAmount'), 300);
  v_mult := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusRolloverMultiplier'),    20);
  v_min  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusMinDeposit'),            0);

  select * into v_dep from deposits where id = p_deposit_id for update;
  if not found or v_dep.status <> 'confirmed' or v_dep.is_fake then return; end if;
  if v_dep.bonus_amount > 0 then return; end if;  -- idempotencia
  if v_dep.amount < v_min then return; end if;

  select count(*) into v_prior
  from deposits
  where user_id = v_dep.user_id
    and status = 'confirmed'
    and not is_fake
    and id <> p_deposit_id;
  if v_prior > 0 then return; end if;

  v_bonus := least(round(v_dep.amount * v_pct / 100.0, 2), v_max);
  if v_bonus <= 0 then return; end if;

  update deposits set bonus_amount = v_bonus where id = p_deposit_id;
  update accounts set balance = balance + v_bonus where id = v_dep.account_id;

  update profiles set
    bonus_balance      = v_bonus,
    rollover_required  = v_bonus * v_mult,
    rollover_completed = 0,
    bonus_granted_at   = now()
  where id = v_dep.user_id;

  insert into transactions (account_id, type, amount, description)
  values (v_dep.account_id, 'BONUS', v_bonus,
          'Bônus de 1º depósito (' || trim(to_char(v_pct,'FM999990')) || '% até R$' || trim(to_char(v_max,'FM999G999G990')) || ')');
end;
$function$;

-- 4) admin_list_active_bonuses: usuarios com bonus ativo + passivo total
CREATE OR REPLACE FUNCTION public.admin_list_active_bonuses(p_search text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_total     int;
  v_liability numeric;
  v_rows      jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT coalesce(sum(bonus_balance),0) INTO v_liability FROM public.profiles WHERE bonus_balance > 0;

  WITH base AS (
    SELECT p.id AS user_id, p.name AS user_name, u.email AS user_email,
           p.bonus_balance, p.rollover_required, p.rollover_completed,
           greatest(p.rollover_required - p.rollover_completed, 0) AS remaining,
           p.bonus_granted_at
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.bonus_balance > 0
      AND (p_search IS NULL OR p_search='' OR p.name ILIKE '%'||p_search||'%' OR u.email ILIKE '%'||p_search||'%')
  )
  SELECT count(*) INTO v_total FROM base;

  WITH base AS (
    SELECT p.id AS user_id, p.name AS user_name, u.email AS user_email,
           p.bonus_balance, p.rollover_required, p.rollover_completed,
           greatest(p.rollover_required - p.rollover_completed, 0) AS remaining,
           p.bonus_granted_at
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.bonus_balance > 0
      AND (p_search IS NULL OR p_search='' OR p.name ILIKE '%'||p_search||'%' OR u.email ILIKE '%'||p_search||'%')
    ORDER BY p.bonus_granted_at DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', user_id, 'user_name', user_name, 'user_email', user_email,
    'bonus_balance', bonus_balance, 'rollover_required', rollover_required,
    'rollover_completed', rollover_completed, 'remaining', remaining,
    'bonus_granted_at', bonus_granted_at
  )), '[]'::jsonb) INTO v_rows FROM base;

  RETURN jsonb_build_object('total', v_total, 'liability', v_liability, 'rows', v_rows);
END;
$function$;

-- 5) admin_revoke_bonus: estorna o bonus ainda travado e zera o rollover (anti-abuso)
CREATE OR REPLACE FUNCTION public.admin_revoke_bonus(p_user_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_bonus numeric;
  v_acc   uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 3 caracteres)';
  END IF;

  SELECT bonus_balance INTO v_bonus FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF coalesce(v_bonus,0) <= 0 THEN RAISE EXCEPTION 'Usuário sem bônus ativo'; END IF;

  SELECT id INTO v_acc FROM public.accounts WHERE user_id = p_user_id AND type='REAL';

  IF v_acc IS NOT NULL THEN
    UPDATE public.accounts SET balance = greatest(balance - v_bonus, 0) WHERE id = v_acc;
    INSERT INTO public.transactions (account_id, type, amount, description)
    VALUES (v_acc, 'BONUS', -v_bonus, 'Bônus revogado pelo admin: ' || p_reason);
  END IF;

  UPDATE public.profiles SET bonus_balance = 0, rollover_required = 0, rollover_completed = 0
  WHERE id = p_user_id;

  PERFORM public.log_admin_action('revoke_bonus', 'user', p_user_id,
    jsonb_build_object('bonus_balance', v_bonus), jsonb_build_object('revoked', true), p_reason);
END;
$function$;

-- Permissoes
REVOKE ALL ON FUNCTION public.admin_list_active_bonuses(text,int,int) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_bonus(uuid,text)           FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_active_bonuses(text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_bonus(uuid,text)           TO authenticated;
