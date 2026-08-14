-- Perfil do usuario (self-service): colunas + RPC update_my_profile.
-- Motivo: a tela "Minha Conta > Dados pessoais" era um mock hardcoded que nao
-- salvava. Escrita direta em profiles e bloqueada por RLS (admin usa SECURITY
-- DEFINER), entao o save do usuario precisa de uma RPC SECURITY DEFINER que
-- atua apenas sobre a propria linha (auth.uid()).
--
-- Idempotente: pode rodar varias vezes sem efeito colateral.

-- 1) Colunas adicionais no perfil (mantem as ja existentes: name, cpf, phone, kyc_status)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname   text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country    text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address    text;

-- 2) RPC: usuario atualiza o PROPRIO perfil. Cada parametro e opcional:
--    NULL = nao mexe naquele campo (COALESCE preserva o valor atual).
--    Para LIMPAR um campo, o cliente manda string vazia tratada como NULL no app;
--    aqui, NULL preserva — entao limpar exige enviar '' e o app converte. Mantemos
--    simples: NULL preserva, valor sobrescreve.
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_name       text DEFAULT NULL,
  p_nickname   text DEFAULT NULL,
  p_cpf        text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_country    text DEFAULT NULL,
  p_address    text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  UPDATE public.profiles SET
    name       = COALESCE(p_name,       name),
    nickname   = COALESCE(p_nickname,   nickname),
    cpf        = COALESCE(p_cpf,        cpf),
    birth_date = COALESCE(p_birth_date, birth_date),
    country    = COALESCE(p_country,    country),
    address    = COALESCE(p_address,    address)
  WHERE id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  RETURN json_build_object('ok', true);
END;
$function$;

-- 3) Permitir que usuarios logados executem (a RPC restringe a propria linha via auth.uid()).
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, date, text, text) TO authenticated;
