-- Lista os user_id que sao admin, pra tela de usuarios marcar quem ja tem
-- acesso. Aditiva: nao altera admin_list_users nem nenhuma outra funcao.
--
-- Devolve so ids (sem role/created_by) — a tela nao precisa de mais que isso.

CREATE OR REPLACE FUNCTION public.admin_list_admin_ids()
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN COALESCE(ARRAY(SELECT user_id FROM public.admin_users), ARRAY[]::uuid[]);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_admin_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_admin_ids() TO authenticated;
