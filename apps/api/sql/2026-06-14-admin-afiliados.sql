-- Módulo Afiliados (parceiros gerenciados pelo admin, modelo CPA) — prod 2026-06-14.
-- Aplicado via Supabase MCP (apply_migration). Este arquivo e o REGISTRO do que foi rodado.
--
-- Afiliado tem codigo/link (vertexmarkets.co/?aff=CODE). Usuario que se cadastra com
-- esse param fica vinculado (link_affiliate_referral, chamado no register). Quando faz
-- um deposito confirmado >= min_deposit, a indicacao QUALIFICA (trigger) e gera comissao
-- fixa (cpa_amount). Admin gerencia e marca como pago.
-- Frontend: apps/web/src/lib/attribution.ts (captura ?aff), store/auth.ts (vinculo),
-- components/auth/AuthProvider.tsx (captura), app/admin/afiliados/page.tsx (painel).

-- 1) Tabelas
CREATE TABLE IF NOT EXISTS public.affiliates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  contact     text,
  cpa_amount  numeric NOT NULL DEFAULT 0,
  min_deposit numeric NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'active',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL UNIQUE,
  qualified         boolean NOT NULL DEFAULT false,
  qualified_at      timestamptz,
  commission_amount numeric NOT NULL DEFAULT 0,
  commission_paid   boolean NOT NULL DEFAULT false,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS affiliate_referrals_affiliate_idx ON public.affiliate_referrals(affiliate_id);

-- 2) Vinculo no cadastro (usa auth.uid() do usuario recem-criado; idempotente)
CREATE OR REPLACE FUNCTION public.link_affiliate_referral(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_aff uuid;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT id INTO v_aff FROM public.affiliates WHERE lower(code) = lower(btrim(p_code)) AND status='active';
  IF v_aff IS NULL THEN RETURN; END IF;
  INSERT INTO public.affiliate_referrals (affiliate_id, user_id)
  VALUES (v_aff, auth.uid())
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

-- 3) Qualificacao automatica no deposito confirmado (webhook + confirmacao manual)
CREATE OR REPLACE FUNCTION public.affiliate_on_deposit_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref public.affiliate_referrals%rowtype;
  v_aff public.affiliates%rowtype;
BEGIN
  IF NEW.status <> 'confirmed' OR coalesce(NEW.is_fake,false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN RETURN NEW; END IF;

  SELECT * INTO v_ref FROM public.affiliate_referrals
   WHERE user_id = NEW.user_id AND NOT qualified FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_aff FROM public.affiliates WHERE id = v_ref.affiliate_id AND status='active';
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.amount < v_aff.min_deposit THEN RETURN NEW; END IF;

  UPDATE public.affiliate_referrals
     SET qualified = true, qualified_at = now(), commission_amount = v_aff.cpa_amount
   WHERE id = v_ref.id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_affiliate_on_deposit ON public.deposits;
CREATE TRIGGER trg_affiliate_on_deposit
AFTER INSERT OR UPDATE OF status ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.affiliate_on_deposit_confirmed();

-- 4) RPCs admin
CREATE OR REPLACE FUNCTION public.admin_list_affiliates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_rows   jsonb;
  v_totals jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x_created DESC), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'code', a.code, 'name', a.name, 'contact', a.contact,
      'cpa_amount', a.cpa_amount, 'min_deposit', a.min_deposit, 'status', a.status,
      'created_at', a.created_at,
      'referrals',       coalesce(r.cnt,0),
      'qualified',       coalesce(r.qcnt,0),
      'commission_owed', coalesce(r.owed,0),
      'commission_paid', coalesce(r.paid,0)
    ) AS x, a.created_at AS x_created
    FROM public.affiliates a
    LEFT JOIN (
      SELECT affiliate_id,
        count(*) AS cnt,
        count(*) FILTER (WHERE qualified) AS qcnt,
        sum(commission_amount) FILTER (WHERE qualified AND NOT commission_paid) AS owed,
        sum(commission_amount) FILTER (WHERE commission_paid) AS paid
      FROM public.affiliate_referrals GROUP BY affiliate_id
    ) r ON r.affiliate_id = a.id
  ) t;

  SELECT jsonb_build_object(
    'affiliates',      (SELECT count(*) FROM public.affiliates),
    'commission_owed', coalesce((SELECT sum(commission_amount) FROM public.affiliate_referrals WHERE qualified AND NOT commission_paid),0),
    'commission_paid', coalesce((SELECT sum(commission_amount) FROM public.affiliate_referrals WHERE commission_paid),0)
  ) INTO v_totals;

  RETURN jsonb_build_object('totals', v_totals, 'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_affiliate(
  p_id uuid, p_code text, p_name text, p_contact text,
  p_cpa_amount numeric, p_min_deposit numeric, p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_code IS NULL OR btrim(p_code) = '' THEN RAISE EXCEPTION 'Código obrigatório'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome obrigatório'; END IF;
  IF coalesce(p_cpa_amount,0) < 0 OR coalesce(p_min_deposit,0) < 0 THEN RAISE EXCEPTION 'Valores inválidos'; END IF;
  IF coalesce(p_status,'active') NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Status inválido'; END IF;

  IF p_id IS NULL THEN
    BEGIN
      INSERT INTO public.affiliates (code, name, contact, cpa_amount, min_deposit, status)
      VALUES (btrim(p_code), btrim(p_name), nullif(btrim(coalesce(p_contact,'')),''),
              coalesce(p_cpa_amount,0), coalesce(p_min_deposit,0), coalesce(p_status,'active'))
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Já existe um afiliado com esse código';
    END;
    PERFORM public.log_admin_action('create_affiliate','affiliate', v_id, NULL,
      jsonb_build_object('code', p_code, 'cpa_amount', p_cpa_amount, 'min_deposit', p_min_deposit), NULL);
  ELSE
    UPDATE public.affiliates SET
      code = btrim(p_code), name = btrim(p_name),
      contact = nullif(btrim(coalesce(p_contact,'')),''),
      cpa_amount = coalesce(p_cpa_amount,0), min_deposit = coalesce(p_min_deposit,0),
      status = coalesce(p_status, status), updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Afiliado não encontrado'; END IF;
    PERFORM public.log_admin_action('update_affiliate','affiliate', v_id, NULL,
      jsonb_build_object('code', p_code, 'cpa_amount', p_cpa_amount, 'status', p_status), NULL);
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_affiliate_referrals(p_affiliate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', r.user_id, 'user_name', p.name, 'user_email', u.email,
    'qualified', r.qualified, 'qualified_at', r.qualified_at,
    'commission_amount', r.commission_amount, 'commission_paid', r.commission_paid,
    'paid_at', r.paid_at, 'created_at', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v
  FROM public.affiliate_referrals r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.affiliate_id = p_affiliate_id;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_affiliate_paid(p_affiliate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_cnt int;
  v_sum numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  WITH upd AS (
    UPDATE public.affiliate_referrals
       SET commission_paid = true, paid_at = now()
     WHERE affiliate_id = p_affiliate_id AND qualified AND NOT commission_paid
    RETURNING commission_amount
  )
  SELECT count(*), coalesce(sum(commission_amount),0) INTO v_cnt, v_sum FROM upd;
  PERFORM public.log_admin_action('pay_affiliate','affiliate', p_affiliate_id, NULL,
    jsonb_build_object('count', v_cnt, 'amount', v_sum), NULL);
  RETURN jsonb_build_object('count', v_cnt, 'amount', v_sum);
END;
$function$;

-- 5) Permissoes
REVOKE ALL ON FUNCTION public.link_affiliate_referral(text)                                   FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_list_affiliates()                                          FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_affiliate(uuid,text,text,text,numeric,numeric,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_affiliate_referrals(uuid)                                  FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_mark_affiliate_paid(uuid)                                  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.link_affiliate_referral(text)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_affiliates()                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_affiliate(uuid,text,text,text,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_affiliate_referrals(uuid)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_affiliate_paid(uuid)                                  TO authenticated;
