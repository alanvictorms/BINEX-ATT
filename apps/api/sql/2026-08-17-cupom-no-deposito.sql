-- Liga o cupom ao deposito: sem isto, `redeem_coupon` grava o resgate e nao
-- credita nada — a tela prometeria "R$ 100 de bonus" e o saldo nao mexeria.
--
-- Duas decisoes que valem registro:
--
-- 1. O cupom e consumido quando o PIX E PAGO, nao quando o QR e gerado. O codigo
--    viaja no /api/payments/pix/create, e validado no servidor e fica gravado na
--    linha do deposito; o credito sai dentro de confirm_deposit. Consumir no
--    clique queimaria cupom de quantidade limitada com quem gera QR e nao paga, e
--    o segundo QR do mesmo usuario ja bateria no per_user_limit.
--
-- 2. O cupom SUBSTITUI o bonus escalonado, nao soma. apply_coupon_bonus roda
--    ANTES de grant_first_deposit_bonus e grava deposits.bonus_amount — o guard
--    de idempotencia que ja existe la (`if v_dep.bonus_amount > 0 then return`)
--    faz o degrau escalonado virar no-op sozinho. Sem isso, 200% do 1o deposito
--    + 100% de cupom = 300% num deposito de R$ 5.000.
--    A tela de deposito avisa quando o escalonado seria maior, entao a troca e
--    escolha informada do usuario.

-- ── Colunas ─────────────────────────────────────────────────────────────────

ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS coupon_code text;

-- Qual deposito pagou o resgate. A tabela nasceu prometendo isso no comentario
-- ("quem usou, quando, em que deposito") e a coluna nao existia.
ALTER TABLE public.coupon_redemptions
  ADD COLUMN IF NOT EXISTS deposit_id uuid REFERENCES public.deposits(id) ON DELETE SET NULL;

-- Trava de credito duplo: o webhook do BSPay reentrega o mesmo evento ate 6x e a
-- confirmacao manual do admin pode correr junto. Um resgate por deposito, ponto.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_deposit_uk
  ON public.coupon_redemptions(deposit_id) WHERE deposit_id IS NOT NULL;

-- ── Resgate com usuario explicito ───────────────────────────────────────────
-- O `redeem_coupon` publico depende de auth.uid(), que e NULL no webhook (roda
-- com service role, sem sessao). Esta e a versao com o dono do deposito passado
-- na mao; a publica virou casca dela pra logica de limite viver num lugar so.
CREATE OR REPLACE FUNCTION public.redeem_coupon_for(
  p_user uuid, p_code text, p_amount numeric,
  p_deposit uuid DEFAULT NULL, p_kind text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  c public.coupons%ROWTYPE;
  v_usos_total int;
  v_usos_user  int;
  v_benefit numeric;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'Não autenticado'); END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND OR NOT c.enabled THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom inválido'); END IF;
  IF p_kind IS NOT NULL AND c.kind <> p_kind THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cupom não vale para esta operação');
  END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom ainda não começou'); END IF;
  IF c.ends_at   IS NOT NULL AND now() > c.ends_at   THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom expirado'); END IF;
  IF p_amount < c.min_amount THEN RETURN jsonb_build_object('ok', false, 'reason', 'Valor abaixo do mínimo'); END IF;

  SELECT count(*) INTO v_usos_total FROM public.coupon_redemptions WHERE coupon_id = c.id;
  IF c.total_quantity > 0 AND v_usos_total >= c.total_quantity THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cupom esgotado');
  END IF;

  SELECT count(*) INTO v_usos_user FROM public.coupon_redemptions WHERE coupon_id = c.id AND user_id = p_user;
  IF c.per_user_limit > 0 AND v_usos_user >= c.per_user_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Limite por usuário atingido');
  END IF;

  v_benefit := round(p_amount * c.percent / 100, 2);
  IF c.max_benefit > 0 AND v_benefit > c.max_benefit THEN v_benefit := c.max_benefit; END IF;

  INSERT INTO public.coupon_redemptions (coupon_id, user_id, amount, benefit, deposit_id)
  VALUES (c.id, p_user, p_amount, v_benefit, p_deposit);

  RETURN jsonb_build_object(
    'ok', true, 'code', c.code, 'kind', c.kind, 'percent', c.percent,
    'benefit', v_benefit, 'rollover_mult', c.rollover_mult
  );
END;
$function$;

-- Mesma assinatura de antes (os GRANTs seguem valendo): resgate do usuario logado.
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code text, p_amount numeric)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
  SELECT public.redeem_coupon_for(auth.uid(), p_code, p_amount, NULL, NULL);
$function$;

-- ── Credito do cupom no deposito ────────────────────────────────────────────
-- Espelha o que grant_first_deposit_bonus faz com o bonus escalonado: credita a
-- conta, trava o valor em rollover no profile e deixa rastro em transactions.
-- O multiplicador de rollover e o do CUPOM (coupons.rollover_mult), nao o global.
CREATE OR REPLACE FUNCTION public.apply_coupon_bonus(p_deposit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dep     deposits%rowtype;
  v_res     jsonb;
  v_benefit numeric;
  v_mult    numeric;
  v_active  numeric;
BEGIN
  SELECT * INTO v_dep FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND OR v_dep.status <> 'confirmed' OR v_dep.is_fake THEN RETURN; END IF;
  IF v_dep.coupon_code IS NULL OR btrim(v_dep.coupon_code) = '' THEN RETURN; END IF;
  IF coalesce(v_dep.bonus_amount, 0) > 0 THEN RETURN; END IF;  -- ja bonificado

  -- Reentrega do webhook cai aqui e sai sem creditar de novo.
  IF EXISTS (SELECT 1 FROM coupon_redemptions WHERE deposit_id = p_deposit_id) THEN RETURN; END IF;

  v_res := public.redeem_coupon_for(
    v_dep.user_id, v_dep.coupon_code, v_dep.amount, p_deposit_id, 'deposit_bonus'
  );

  -- Cupom que expirou ou esgotou entre gerar o QR e pagar: o deposito segue
  -- normal (o valor ja foi creditado por quem chamou), so nao ha bonus.
  IF NOT coalesce((v_res->>'ok')::boolean, false) THEN
    RAISE LOG 'apply_coupon_bonus: cupom % recusado no deposito % — %',
      v_dep.coupon_code, p_deposit_id, v_res->>'reason';
    RETURN;
  END IF;

  v_benefit := (v_res->>'benefit')::numeric;
  v_mult    := coalesce((v_res->>'rollover_mult')::numeric, 20);
  IF v_benefit <= 0 THEN RETURN; END IF;

  -- Marcar bonus_amount aqui e o que faz grant_first_deposit_bonus virar no-op
  -- logo em seguida: cupom SUBSTITUI o degrau escalonado.
  UPDATE deposits SET bonus_amount = v_benefit WHERE id = p_deposit_id;
  UPDATE accounts SET balance = balance + v_benefit WHERE id = v_dep.account_id;

  -- Acumulacao igual a do bonus escalonado: bonus anterior ainda travado soma e
  -- PRESERVA granted_at (sync_bonus_rollover mede volume desde essa data).
  SELECT bonus_balance INTO v_active FROM profiles WHERE id = v_dep.user_id FOR UPDATE;
  IF coalesce(v_active, 0) > 0 THEN
    UPDATE profiles SET
      bonus_balance     = bonus_balance + v_benefit,
      rollover_required = rollover_required + v_benefit * v_mult
    WHERE id = v_dep.user_id;
  ELSE
    UPDATE profiles SET
      bonus_balance      = v_benefit,
      rollover_required  = v_benefit * v_mult,
      rollover_completed = 0,
      bonus_granted_at   = now()
    WHERE id = v_dep.user_id;
  END IF;

  INSERT INTO transactions (account_id, type, amount, description)
  VALUES (v_dep.account_id, 'BONUS', v_benefit,
          'Bônus do cupom ' || (v_res->>'code') || ' (' ||
          trim(to_char((v_res->>'percent')::numeric, 'FM999990')) || '%)');
END;
$function$;

-- ── Pontos de confirmacao ───────────────────────────────────────────────────
-- Identicas as de producao, com UMA linha nova cada: apply_coupon_bonus ANTES do
-- grant_first_deposit_bonus (a ordem e o que implementa "cupom substitui").

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

  perform public.apply_coupon_bonus(v_dep.id);
  perform public.grant_first_deposit_bonus(v_dep.id);
end;
$function$;

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

  -- Cupom (se houver) substitui o degrau escalonado; o segundo vira no-op.
  perform public.apply_coupon_bonus(p_deposit_id);
  perform public.grant_first_deposit_bonus(p_deposit_id);
end;
$function$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Nenhuma das duas e chamavel pelo navegador: creditam saldo direto. So rodam de
-- dentro de confirm_deposit / admin_confirm_deposit_manually, que sao DEFINER.
REVOKE ALL ON FUNCTION public.redeem_coupon_for(uuid,text,numeric,uuid,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_coupon_bonus(uuid)                       FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text,numeric) TO authenticated;
