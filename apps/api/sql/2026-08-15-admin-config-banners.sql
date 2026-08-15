-- Libera a chave promoBanners na whitelist de admin_set_config.
--
-- Mesma mecanica das anteriores: a funcao e recriada com o corpo identico, so a
-- lista de chaves cresce. Nenhuma chave existente sai.
--
-- promoBanners guarda um array JSON de banners do carrossel da tela de trade:
--   [{ id, type: 'text'|'image', title, subtitle, imageUrl, href, enabled }]
--
-- Leitura e publica via get_public_config? Nao — o carrossel le por
-- admin_list_config no painel e por uma rota propria no app, entao a chave fica
-- so aqui na escrita.

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
                   'derivEnabled',
                   'bspayBaseUrl','bspayClientId','bspayClientSecret','bspayWebhookSecret',
                   'promoBanners') THEN
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

REVOKE ALL ON FUNCTION public.admin_set_config(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_config(text, jsonb) TO authenticated;

-- Leitura publica dos banners: o carrossel roda pra usuario logado comum, que
-- nao passa no is_admin() do admin_list_config.
CREATE OR REPLACE FUNCTION public.get_promo_banners()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT value FROM public.app_config WHERE key = 'promoBanners'), '[]'::jsonb);
$function$;

REVOKE ALL ON FUNCTION public.get_promo_banners() FROM public;
GRANT EXECUTE ON FUNCTION public.get_promo_banners() TO anon, authenticated;

INSERT INTO public.app_config (key, value)
VALUES ('promoBanners', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;
