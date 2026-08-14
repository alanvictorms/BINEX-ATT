-- Admin / Configurações (essencial) — DDL aplicado em produção (Supabase yilmbwrfaljxgvsygmyz) 2026-06-14.
-- Aplicado via Supabase MCP (apply_migration). Este arquivo e o REGISTRO do que foi rodado.
--
-- Parametros operacionais globais em app_config (key/value jsonb):
--   limites de deposito/saque, gate de cadastro, modo manutencao.
-- Consumido por apps/web/src/app/admin/configuracoes/page.tsx (admin_list_config/admin_set_config)
-- e pela UI publica via get_public_config (limites + banner + gate de cadastro).
-- A trava de saque vive dentro de request_withdrawal (min/max por config).
-- A trava de deposito vive em apps/web/src/app/api/payments/pix/create/route.ts.

-- 1) Seed das chaves (nao sobrescreve se ja existir). copyTradeEnabled ja existia.
INSERT INTO public.app_config (key, value) VALUES
  ('depositMin',          '50'::jsonb),
  ('depositMax',          '5000'::jsonb),
  ('withdrawalMin',       '50'::jsonb),
  ('withdrawalMax',       '5000'::jsonb),
  ('registrationEnabled', 'true'::jsonb),
  ('maintenanceMode',     'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Leitura admin de toda a config
CREATE OR REPLACE FUNCTION public.admin_list_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN COALESCE((SELECT jsonb_object_agg(key, value) FROM public.app_config), '{}'::jsonb);
END;
$function$;

-- 3) Gravacao admin (whitelist de chaves + audit log)
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
                   'registrationEnabled','maintenanceMode','copyTradeEnabled') THEN
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

-- 4) Leitura publica (whitelist operacional) — limites, banner, gate de cadastro
CREATE OR REPLACE FUNCTION public.get_public_config()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','auth'
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

-- 5) request_withdrawal: min/max por config (substitui o minimo fixo de R$50).
--    Mantem TODA a logica original (permissao, bonus em rollover, debito, inserts).
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

  update accounts set balance = balance - p_amount where id = p_account_id;

  insert into withdrawals (user_id, account_id, amount, pix_key_type, pix_key)
  values (v_user_id, p_account_id, p_amount, p_pix_key_type, p_pix_key)
  returning id into v_wid;

  insert into transactions (account_id, type, amount, description)
  values (p_account_id, 'WITHDRAWAL', -p_amount, 'Solicitação de retirada via PIX');

  return v_wid;
end;
$function$;

-- Permissoes
REVOKE ALL ON FUNCTION public.admin_list_config()              FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_config(text, jsonb)    FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_config()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_config(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_config()           TO anon, authenticated;
