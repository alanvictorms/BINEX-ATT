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
-- ─── admin_confirm_deposit_manually(p_deposit_id uuid, p_reason text) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_confirm_deposit_manually(p_deposit_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_dep deposits%rowtype;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Acesso negado'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Motivo obrigatório (mín. 5 caracteres)';
  end if;

  select * into v_dep from public.deposits where id = p_deposit_id for update;
  if not found then raise exception 'Depósito não encontrado'; end if;
  if v_dep.status = 'confirmed' then raise exception 'Depósito já confirmado'; end if;
  if v_dep.is_fake then raise exception 'Depósito marcado como fake — desmarque antes'; end if;

  -- Credita saldo REAL
  update public.accounts set balance = balance + v_dep.amount where id = v_dep.account_id;

  -- Marca como confirmado
  update public.deposits set
    status              = 'confirmed',
    confirmed_at        = now(),
    confirmed_by_admin  = auth.uid(),
    confirm_notes       = p_reason
  where id = p_deposit_id;

  perform public.log_admin_action('manual_confirm_deposit', 'deposit', p_deposit_id,
    jsonb_build_object('status', v_dep.status, 'amount', v_dep.amount),
    jsonb_build_object('status', 'confirmed', 'credited_amount', v_dep.amount),
    p_reason);

  -- Bônus de 1º depósito (idempotente; no-op se não for o primeiro)
  perform public.grant_first_deposit_bonus(p_deposit_id);
end;
$function$;

-- ─── admin_revoke_bonus(p_user_id uuid, p_reason text) ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_bonus(p_user_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
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

  -- Remove o bônus ainda travado da conta REAL (limitado ao saldo disponível)
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

-- ─── admin_set_config(p_key text, p_value jsonb) ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_set_config(p_key text, p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
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

-- ─── confirm_deposit(p_external_id text) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_deposit(p_external_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dep deposits%rowtype;
begin
  select * into v_dep
  from deposits
  where external_id = p_external_id and status = 'pending'
  for update;

  if not found then return; end if;

  update deposits
  set status = 'confirmed', confirmed_at = now()
  where external_id = p_external_id;

  update accounts
  set balance = balance + v_dep.amount
  where id = v_dep.account_id;

  insert into transactions (account_id, type, amount, description)
  values (v_dep.account_id, 'DEPOSIT', v_dep.amount, 'Depósito via PIX');

  perform public.grant_first_deposit_bonus(v_dep.id);
end;
$function$;

-- ─── get_public_config() ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_config()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT jsonb_build_object(
    'depositMin',          COALESCE((SELECT value FROM public.app_config WHERE key='depositMin'),          '50'::jsonb),
    'depositMax',          COALESCE((SELECT value FROM public.app_config WHERE key='depositMax'),          '5000'::jsonb),
    'withdrawalMin',       COALESCE((SELECT value FROM public.app_config WHERE key='withdrawalMin'),       '50'::jsonb),
    'withdrawalMax',       COALESCE((SELECT value FROM public.app_config WHERE key='withdrawalMax'),       '5000'::jsonb),
    'registrationEnabled', COALESCE((SELECT value FROM public.app_config WHERE key='registrationEnabled'), 'true'::jsonb),
    'maintenanceMode',     COALESCE((SELECT value FROM public.app_config WHERE key='maintenanceMode'),     'false'::jsonb)
  );
$function$;

-- ─── grant_first_deposit_bonus(p_deposit_id uuid) ───────────────────────────────────

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
  -- ── Config da oferta (Admin → Bônus) ──
  v_enabled := coalesce((select (value #>> '{}')::boolean from app_config where key='bonusFirstDepositEnabled'), true);
  if not v_enabled then return; end if;
  v_pct  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusFirstDepositPct'),       100);
  v_max  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusFirstDepositMaxAmount'), 300);
  v_mult := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusRolloverMultiplier'),    20);
  v_min  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusMinDeposit'),            0);

  select * into v_dep from deposits where id = p_deposit_id for update;
  if not found or v_dep.status <> 'confirmed' or v_dep.is_fake then return; end if;
  if v_dep.bonus_amount > 0 then return; end if;  -- idempotência
  if v_dep.amount < v_min then return; end if;

  -- Só o PRIMEIRO depósito confirmado não-fake do usuário
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

-- ─── request_withdrawal(p_account_id uuid, p_amount numeric, p_pix_key_type text, p_pix_key text) ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_account_id uuid, p_amount numeric, p_pix_key_type text, p_pix_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_balance   numeric;
  v_user_id   uuid;
  v_wid       uuid;
  v_bonus     numeric;
  v_remaining numeric;
  v_available numeric;
  v_min       numeric;
  v_max       numeric;
begin
  select balance, user_id into v_balance, v_user_id
  from accounts
  where id = p_account_id and type = 'REAL';

  if not found then
    raise exception 'Conta não encontrada';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'Sem permissão';
  end if;

  v_min := coalesce((select (value #>> '{}')::numeric from public.app_config where key='withdrawalMin'), 50);
  v_max := coalesce((select (value #>> '{}')::numeric from public.app_config where key='withdrawalMax'), 999999999);

  if p_amount < v_min then
    raise exception 'Valor mínimo de retirada: R$ %', to_char(v_min, 'FM999G999G990D00');
  end if;
  if p_amount > v_max then
    raise exception 'Valor máximo de retirada: R$ %', to_char(v_max, 'FM999G999G990D00');
  end if;

  if v_balance < p_amount then
    raise exception 'Saldo insuficiente';
  end if;

  -- Bônus em rollover não pode sair pelo saque: sacável = saldo − bônus ativo
  perform public.sync_bonus_rollover(v_user_id);
  select bonus_balance, greatest(rollover_required - rollover_completed, 0)
    into v_bonus, v_remaining
  from profiles where id = v_user_id;

  if coalesce(v_bonus, 0) > 0 then
    v_available := greatest(v_balance - v_bonus, 0);
    if p_amount > v_available then
      raise exception 'Disponível para saque: R$ % — R$ % de bônus em rollover. Opere mais R$ % em volume para liberar o bônus.',
        to_char(v_available, 'FM999G999G990D00'),
        to_char(v_bonus, 'FM999G999G990D00'),
        to_char(v_remaining, 'FM999G999G990D00');
    end if;
  end if;

  -- Bloqueia o saldo (debita imediatamente, devolve se rejeitado)
  update accounts set balance = balance - p_amount where id = p_account_id;

  insert into withdrawals (user_id, account_id, amount, pix_key_type, pix_key)
  values (v_user_id, p_account_id, p_amount, p_pix_key_type, p_pix_key)
  returning id into v_wid;

  insert into transactions (account_id, type, amount, description)
  values (p_account_id, 'WITHDRAWAL', -p_amount, 'Solicitação de retirada via PIX');

  return v_wid;
end;
$function$;

-- ─── sync_bonus_rollover(p_user_id uuid) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_bonus_rollover(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile profiles%rowtype;
  v_volume  numeric;
begin
  select * into v_profile from profiles where id = p_user_id for update;
  if not found or v_profile.bonus_balance <= 0 then return; end if;

  select coalesce(sum(o.amount), 0) into v_volume
  from operations o
  join accounts a on a.id = o.account_id
  where a.user_id = p_user_id
    and a.type = 'REAL'
    and o.created_at >= coalesce(v_profile.bonus_granted_at, 'epoch'::timestamptz);

  if v_volume >= v_profile.rollover_required then
    -- Rollover cumprido: bônus liberado (vira saldo comum)
    update profiles
    set bonus_balance = 0, rollover_completed = rollover_required
    where id = p_user_id;
  else
    update profiles
    set rollover_completed = v_volume
    where id = p_user_id;
  end if;
end;
$function$;
