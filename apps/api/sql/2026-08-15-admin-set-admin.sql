-- RPC para promover/rebaixar admin a partir da tela de usuarios.
--
-- Aditivo: cria uma funcao nova, nao altera nenhuma existente. A tabela
-- admin_users ja era a fonte de verdade do is_admin() — isto so da uma porta de
-- UI pra ela, no lugar de rodar prisma/promote-admin.ts na mao.
--
-- Duas travas de seguranca:
--   1) So admin chama (mesmo guard das demais RPCs de admin).
--   2) Ninguem tira o proprio admin. Sem isso, um clique errado tranca a pessoa
--      pra fora do painel e so da pra voltar por script no servidor.

CREATE OR REPLACE FUNCTION public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth'
AS $function$
DECLARE
  v_was boolean;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF p_user_id = auth.uid() AND p_is_admin = false THEN
    RAISE EXCEPTION 'Você não pode remover o próprio acesso de admin';
  END IF;

  v_was := EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id);

  IF p_is_admin THEN
    INSERT INTO public.admin_users (user_id, role, created_by)
    VALUES (p_user_id, 'admin', auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.admin_users WHERE user_id = p_user_id;
  END IF;

  PERFORM public.log_admin_action('set_admin', 'user', p_user_id,
    jsonb_build_object('is_admin', v_was),
    jsonb_build_object('is_admin', p_is_admin),
    NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_admin(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;
