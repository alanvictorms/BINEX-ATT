-- Bônus escalonado nos 3 primeiros depósitos — 2026-07-09.
-- Este arquivo é o REGISTRO do que foi aplicado em produção (Supabase) via
-- script com DATABASE_URL. Snapshot do estado ANTERIOR das functions em
-- 2026-07-09-rpc-snapshot-bonus-deposit.sql.
--
-- O que muda:
--   - grant_first_deposit_bonus: em vez de só o 1º depósito, aplica uma ESCADA
--     de percentuais por número do depósito (config bonusDepositPcts, default
--     [200,100,50] = 1º 200%, 2º 100%, 3º 50%, 4º+ sem bônus).
--   - Acumulação de rollover: bônus novo com rollover anterior ainda ativo SOMA
--     bonus_balance e rollover_required SEM resetar bonus_granted_at nem
--     rollover_completed — sync_bonus_rollover mede volume desde granted_at,
--     então resetar a data descartaria progresso já operado. Sem bônus ativo
--     (primeiro ou já liberado), abre ciclo novo do zero.
--   - admin_set_config: whitelist ganha 'bonusDepositPcts'.
--   - NÃO sobrescreve teto/mínimo já configurados no admin (produção: teto R$500,
--     mín R$100). Os seeds abaixo só entram se a chave ainda não existir.
--
-- Compatibilidade: confirm_deposit / admin_confirm_deposit_manually continuam
-- chamando grant_first_deposit_bonus pelo MESMO nome (não são alteradas).
-- Fallback: sem a chave bonusDepositPcts, comporta como antes (só 1º depósito,
-- bonusFirstDepositPct). admin_revoke_bonus revoga o total acumulado (ok).

-- 1) Escada de percentuais (seeds ON CONFLICT DO NOTHING — preserva config atual).
--    Em produção só bonusDepositPcts é novo; teto/mínimo já existem e ficam intactos.
insert into public.app_config (key, value) values
  ('bonusDepositPcts', '[200, 100, 50]'),
  ('bonusFirstDepositMaxAmount', '500'),
  ('bonusMinDeposit', '100')
on conflict (key) do nothing;

-- 2) grant_first_deposit_bonus com escada + acumulação
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
  v_pcts    jsonb;
  v_pct     numeric;
  v_max     numeric;
  v_mult    numeric;
  v_min     numeric;
  v_active  numeric;
begin
  -- ── Config da oferta (Admin → Bônus) ──
  v_enabled := coalesce((select (value #>> '{}')::boolean from app_config where key='bonusFirstDepositEnabled'), true);
  if not v_enabled then return; end if;

  -- Escada de percentuais por número do depósito (1º, 2º, 3º...).
  -- Sem a chave (ou malformada): comporta como antes — só 1º, bonusFirstDepositPct.
  v_pcts := (select value from app_config where key='bonusDepositPcts');
  if v_pcts is null or jsonb_typeof(v_pcts) <> 'array' or jsonb_array_length(v_pcts) = 0 then
    v_pcts := jsonb_build_array(coalesce((select (value #>> '{}')::numeric from app_config where key='bonusFirstDepositPct'), 100));
  end if;

  v_max  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusFirstDepositMaxAmount'), 300);
  v_mult := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusRolloverMultiplier'),    20);
  v_min  := coalesce((select (value #>> '{}')::numeric from app_config where key='bonusMinDeposit'),            0);

  select * into v_dep from deposits where id = p_deposit_id for update;
  if not found or v_dep.status <> 'confirmed' or v_dep.is_fake then return; end if;
  if v_dep.bonus_amount > 0 then return; end if;  -- idempotência
  if v_dep.amount < v_min then return; end if;

  -- Número deste depósito na vida do usuário (0-based) decide o degrau da escada.
  select count(*) into v_prior
  from deposits
  where user_id = v_dep.user_id
    and status = 'confirmed'
    and not is_fake
    and id <> p_deposit_id;
  if v_prior >= jsonb_array_length(v_pcts) then return; end if;  -- escada esgotada

  v_pct   := coalesce((v_pcts ->> v_prior)::numeric, 0);
  v_bonus := least(round(v_dep.amount * v_pct / 100.0, 2), v_max);
  if v_bonus <= 0 then return; end if;

  update deposits set bonus_amount = v_bonus where id = p_deposit_id;
  update accounts set balance = balance + v_bonus where id = v_dep.account_id;

  -- Acumulação: sync_bonus_rollover mede volume desde bonus_granted_at.
  --   bônus anterior ainda travado -> soma valores, PRESERVA granted_at/completed;
  --   sem bônus ativo -> ciclo novo do zero.
  select bonus_balance into v_active from profiles where id = v_dep.user_id for update;
  if coalesce(v_active, 0) > 0 then
    update profiles set
      bonus_balance     = bonus_balance + v_bonus,
      rollover_required = rollover_required + v_bonus * v_mult
    where id = v_dep.user_id;
  else
    update profiles set
      bonus_balance      = v_bonus,
      rollover_required  = v_bonus * v_mult,
      rollover_completed = 0,
      bonus_granted_at   = now()
    where id = v_dep.user_id;
  end if;

  insert into transactions (account_id, type, amount, description)
  values (v_dep.account_id, 'BONUS', v_bonus,
          'Bônus de ' || (v_prior + 1) || 'º depósito (' || trim(to_char(v_pct,'FM999990')) || '% até R$' || trim(to_char(v_max,'FM999G999G990')) || ')');
end;
$function$;

-- 3) admin_set_config: whitelist ganha bonusDepositPcts
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
                   'bonusRolloverMultiplier','bonusMinDeposit','bonusDepositPcts') THEN
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
