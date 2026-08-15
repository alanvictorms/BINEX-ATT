-- Estende a whitelist de admin_set_config para as chaves novas de provedor de
-- dados (Deriv) e credenciais BSPAY.
--
-- admin_set_config so aceita chaves listadas explicitamente; sem isto qualquer
-- gravacao das telas novas morre em "Chave de configuracao invalida".
--
-- Aditivo: a funcao e recriada com o MESMO corpo, so a lista cresce. Nenhuma
-- chave existente sai, nenhuma outra funcao e tocada.
--
-- Chaves novas:
--   derivEnabled       bool  — liga/desliga a Deriv como fornecedora de candles
--   bspayBaseUrl       text
--   bspayClientId      text
--   bspayClientSecret  text
--   bspayWebhookSecret text
--
-- Nota: admin_list_config devolve app_config inteiro para quem passa no
-- is_admin(), entao as credenciais BSPAY ficam legiveis por qualquer admin.
-- E o mesmo modelo ja usado pelas demais chaves desta tabela.

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
                   'bspayBaseUrl','bspayClientId','bspayClientSecret','bspayWebhookSecret') THEN
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

-- Default do provedor: desligado. Ligar e decisao explicita do admin.
INSERT INTO public.app_config (key, value)
VALUES ('derivEnabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
