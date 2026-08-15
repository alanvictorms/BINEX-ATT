-- Policies de escrita no bucket `banners`.
--
-- O bucket e publico pra LEITURA (arte de campanha exibida a qualquer usuario),
-- mas o upload sai do browser com o JWT do admin, e storage.objects tem RLS.
-- Sem estas policies o upload falha com "new row violates row-level security".
--
-- Escopo apertado de proposito: so o bucket banners, so quem passa no is_admin.
-- Nao toca em kyc-documents, que continua fechado e escrito via service role.

DROP POLICY IF EXISTS "banners_admin_insert" ON storage.objects;
CREATE POLICY "banners_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "banners_admin_update" ON storage.objects;
CREATE POLICY "banners_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'banners' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "banners_admin_delete" ON storage.objects;
CREATE POLICY "banners_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND public.is_admin(auth.uid()));
