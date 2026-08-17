-- Cupons de bonus (deposito) e desconto (copy trading).
--
-- Duas tabelas em vez de um contador no proprio cupom: o resgate precisa ser
-- auditavel (quem usou, quando, em que deposito) e o limite por usuario so da
-- pra checar com o historico. Contador solto nao responde "esse usuario ja
-- usou?" nem sobrevive a estorno.
--
-- A checagem de quantidade acontece DENTRO da funcao de resgate, com lock na
-- linha do cupom — sem isso, dois depositos simultaneos no ultimo cupom
-- passariam os dois.

CREATE TABLE IF NOT EXISTS public.coupons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  kind           text NOT NULL CHECK (kind IN ('deposit_bonus','copy_discount')),
  -- Percentual aplicado: bonus sobre o deposito, ou desconto sobre a comissao.
  percent        numeric(6,2) NOT NULL CHECK (percent > 0 AND percent <= 1000),
  min_amount     numeric(14,2) NOT NULL DEFAULT 0,
  -- Teto do beneficio em R$. 0 = sem teto.
  max_benefit    numeric(14,2) NOT NULL DEFAULT 0,
  -- 0 = ilimitado.
  total_quantity integer NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit >= 0),
  -- Rollover exigido pra liberar o bonus pra saque (multiplo do valor recebido).
  rollover_mult  numeric(6,2) NOT NULL DEFAULT 20,
  starts_at      timestamptz,
  ends_at        timestamptz,
  enabled        boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id  uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  amount     numeric(14,2) NOT NULL,
  benefit    numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx ON public.coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_idx   ON public.coupon_redemptions(user_id);

ALTER TABLE public.coupons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions  ENABLE ROW LEVEL SECURITY;

-- Sem policy de SELECT pro usuario comum de proposito: a lista inteira de
-- cupons e informacao de campanha. O acesso do usuario passa so pela funcao de
-- validacao abaixo, que devolve um cupom por vez e so se ele for valido.

-- ── Validacao (usuario) ─────────────────────────────────────────────────────
-- Nao grava nada: serve pro campo de cupom mostrar o beneficio antes de pagar.
CREATE OR REPLACE FUNCTION public.validate_coupon(p_code text, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  c public.coupons%ROWTYPE;
  v_uid uuid := auth.uid();
  v_usos_total int;
  v_usos_user  int;
  v_benefit numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'Faça login para usar cupom'); END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(btrim(p_code));
  IF NOT FOUND            THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom não encontrado'); END IF;
  IF NOT c.enabled        THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom inativo'); END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom ainda não começou'); END IF;
  IF c.ends_at   IS NOT NULL AND now() > c.ends_at   THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom expirado'); END IF;
  IF p_amount < c.min_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', format('Valor mínimo de R$ %s', trim(to_char(c.min_amount,'FM999999990.00'))));
  END IF;

  SELECT count(*) INTO v_usos_total FROM public.coupon_redemptions WHERE coupon_id = c.id;
  IF c.total_quantity > 0 AND v_usos_total >= c.total_quantity THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cupom esgotado');
  END IF;

  SELECT count(*) INTO v_usos_user FROM public.coupon_redemptions WHERE coupon_id = c.id AND user_id = v_uid;
  IF c.per_user_limit > 0 AND v_usos_user >= c.per_user_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Você já usou este cupom');
  END IF;

  v_benefit := round(p_amount * c.percent / 100, 2);
  IF c.max_benefit > 0 AND v_benefit > c.max_benefit THEN v_benefit := c.max_benefit; END IF;

  RETURN jsonb_build_object(
    'ok', true, 'code', c.code, 'kind', c.kind, 'percent', c.percent,
    'benefit', v_benefit, 'max_benefit', c.max_benefit, 'rollover_mult', c.rollover_mult
  );
END;
$function$;

-- ── Resgate (usuario) ───────────────────────────────────────────────────────
-- Revalida tudo COM LOCK na linha do cupom. A validacao acima e so pra UI; esta
-- e a que vale, porque entre ver o beneficio e pagar o cupom pode esgotar.
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code text, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  c public.coupons%ROWTYPE;
  v_uid uuid := auth.uid();
  v_usos_total int;
  v_usos_user  int;
  v_benefit numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'Não autenticado'); END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(btrim(p_code)) FOR UPDATE;
  IF NOT FOUND OR NOT c.enabled THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom inválido'); END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom ainda não começou'); END IF;
  IF c.ends_at   IS NOT NULL AND now() > c.ends_at   THEN RETURN jsonb_build_object('ok', false, 'reason', 'Cupom expirado'); END IF;
  IF p_amount < c.min_amount THEN RETURN jsonb_build_object('ok', false, 'reason', 'Valor abaixo do mínimo'); END IF;

  SELECT count(*) INTO v_usos_total FROM public.coupon_redemptions WHERE coupon_id = c.id;
  IF c.total_quantity > 0 AND v_usos_total >= c.total_quantity THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cupom esgotado');
  END IF;

  SELECT count(*) INTO v_usos_user FROM public.coupon_redemptions WHERE coupon_id = c.id AND user_id = v_uid;
  IF c.per_user_limit > 0 AND v_usos_user >= c.per_user_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Limite por usuário atingido');
  END IF;

  v_benefit := round(p_amount * c.percent / 100, 2);
  IF c.max_benefit > 0 AND v_benefit > c.max_benefit THEN v_benefit := c.max_benefit; END IF;

  INSERT INTO public.coupon_redemptions (coupon_id, user_id, amount, benefit)
  VALUES (c.id, v_uid, p_amount, v_benefit);

  RETURN jsonb_build_object('ok', true, 'code', c.code, 'kind', c.kind, 'benefit', v_benefit, 'rollover_mult', c.rollover_mult);
END;
$function$;

-- ── Admin ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_coupons()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (
      SELECT c.*,
             (SELECT count(*) FROM public.coupon_redemptions r WHERE r.coupon_id = c.id) AS used
      FROM public.coupons c
    ) x
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_coupon(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  v_id := NULLIF(p->>'id','')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO public.coupons (code, kind, percent, min_amount, max_benefit, total_quantity, per_user_limit, rollover_mult, starts_at, ends_at, enabled, created_by)
    VALUES (upper(btrim(p->>'code')), p->>'kind', (p->>'percent')::numeric,
            COALESCE((p->>'min_amount')::numeric,0), COALESCE((p->>'max_benefit')::numeric,0),
            COALESCE((p->>'total_quantity')::int,0), COALESCE((p->>'per_user_limit')::int,1),
            COALESCE((p->>'rollover_mult')::numeric,20),
            NULLIF(p->>'starts_at','')::timestamptz, NULLIF(p->>'ends_at','')::timestamptz,
            COALESCE((p->>'enabled')::boolean,true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.coupons SET
      code = upper(btrim(p->>'code')), kind = p->>'kind', percent = (p->>'percent')::numeric,
      min_amount = COALESCE((p->>'min_amount')::numeric,0), max_benefit = COALESCE((p->>'max_benefit')::numeric,0),
      total_quantity = COALESCE((p->>'total_quantity')::int,0), per_user_limit = COALESCE((p->>'per_user_limit')::int,1),
      rollover_mult = COALESCE((p->>'rollover_mult')::numeric,20),
      starts_at = NULLIF(p->>'starts_at','')::timestamptz, ends_at = NULLIF(p->>'ends_at','')::timestamptz,
      enabled = COALESCE((p->>'enabled')::boolean,true)
    WHERE id = v_id;
  END IF;

  PERFORM public.log_admin_action('upsert_coupon','coupon',v_id,NULL,p,NULL);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_coupon(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  DELETE FROM public.coupons WHERE id = p_id;
  PERFORM public.log_admin_action('delete_coupon','coupon',p_id,NULL,NULL,NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_coupon(text,numeric)   FROM public, anon;
REVOKE ALL ON FUNCTION public.redeem_coupon(text,numeric)     FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_coupons()            FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_coupon(jsonb)      FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_delete_coupon(uuid)       FROM public, anon;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text,numeric)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_coupons()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_coupon(jsonb)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_coupon(uuid)     TO authenticated;
