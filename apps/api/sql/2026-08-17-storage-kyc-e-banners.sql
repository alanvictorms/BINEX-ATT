-- Policies de Storage: `kyc-documents` e `banners`.
--
-- Sintoma dos dois: "new row violates row-level security policy" no upload.
-- storage.objects tem RLS ligada por padrao e SEM policy nenhuma escrita e
-- negada — inclusive a do admin, porque RLS nao conhece "admin", so conhece
-- policy.
--
-- Sobre o banners: as policies ja tinham sido escritas em
-- 2026-08-15-storage-banners-policies.sql e nunca chegaram ao banco. Estao
-- repetidas aqui (DROP + CREATE, idempotente) pra fechar tudo numa aplicacao so.
--
-- Sobre o kyc-documents: o arquivo de 08-15 dizia que ele era "escrito via
-- service role". Nao e: o upload sai do VerificacaoTab por secureStorage, que
-- passa pelo proxy /api/s, e o proxy monta o client com o JWT DO USUARIO
-- (createUserClient). Ou seja, RLS vale — e sem policy o envio de documento
-- morre no primeiro arquivo.

-- ── Buckets ─────────────────────────────────────────────────────────────────
-- Idempotente: se ja existem, nada muda (inclusive a flag public, que nao e
-- sobrescrita — bucket de documento nunca deve virar publico por descuido).
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- A policy chama public.is_admin() com o papel do usuario logado, entao ele
-- precisa poder executar a funcao. Sem isto a policy estoura "permission denied
-- for function is_admin" em vez de simplesmente negar.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- ── banners (arte de campanha, leitura publica) ─────────────────────────────

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

-- O bucket e publico, entao a arte ja sai pela URL publica sem passar por RLS.
-- Esta policy e pro que passa pela API autenticada (listar, baixar) — sem ela o
-- painel enxerga o bucket vazio mesmo com arquivo dentro.
DROP POLICY IF EXISTS "banners_read" ON storage.objects;
CREATE POLICY "banners_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'banners');

-- ── kyc-documents (documento de identidade, bucket FECHADO) ────────────────
--
-- O caminho gravado e `<user_id>/<submission_id>/<front|back|selfie>.<ext>`
-- (VerificacaoTab). Entao a primeira pasta do nome E o dono do arquivo, e a
-- policy amarra a escrita nela: ninguem grava na pasta de outro usuario.

DROP POLICY IF EXISTS "kyc_owner_insert" ON storage.objects;
CREATE POLICY "kyc_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "kyc_owner_select" ON storage.objects;
CREATE POLICY "kyc_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- O painel de verificacao gera signed URL pelo navegador do admin
-- (KycReviewModal -> createSignedUrl), o que exige SELECT no objeto.
DROP POLICY IF EXISTS "kyc_admin_select" ON storage.objects;
CREATE POLICY "kyc_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND public.is_admin(auth.uid()));

-- De proposito NAO existe UPDATE nem DELETE de usuario aqui: documento enviado
-- pra analise nao pode ser trocado por baixo do analista. Cada envio abre uma
-- submission nova, com pasta nova, entao o fluxo nao precisa sobrescrever nada.

-- ── kyc_submissions (a linha que aponta pros arquivos) ─────────────────────
-- Mesma armadilha um passo depois: com os arquivos gravando e a linha barrada,
-- o usuario ve o upload passar e o envio falhar no fim.
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kyc_submissions_owner_insert" ON public.kyc_submissions;
CREATE POLICY "kyc_submissions_owner_insert" ON public.kyc_submissions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "kyc_submissions_owner_select" ON public.kyc_submissions;
CREATE POLICY "kyc_submissions_owner_select" ON public.kyc_submissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin continua lendo pelas RPCs SECURITY DEFINER do painel (admin_*), que
-- passam por cima da RLS — nao precisa de policy propria aqui.
