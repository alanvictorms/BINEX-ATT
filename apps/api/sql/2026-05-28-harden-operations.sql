-- Blindagem do motor de operacoes — Reengenharia server-authoritative
-- Projeto Supabase: yilmbwrfaljxgvsygmyz (Vertex Markets)
--
-- Contexto: o cliente decidia preco/resultado das operacoes. Alem das RPCs que
-- confiavam no cliente, o RLS permitia ESCRITA DIRETA nas tabelas (politica
-- cmd='*' em accounts/operations sem WITH CHECK) — um usuario podia setar o
-- proprio saldo via supabase.from('accounts').update({balance}). Toda a escrita
-- agora passa pelo backend Fastify (Prisma, role privilegiada que ignora RLS) ou
-- pelas RPCs SECURITY DEFINER (que executam como owner). O cliente so LE.
--
-- ============================================================================
-- PARTE A — SEGURO PARA APLICAR JA (nao quebra a producao atual)
-- As RPCs sao SECURITY DEFINER (executam como owner) e o backend usa role
-- privilegiada — ambos ignoram RLS e grants de 'authenticated'. O frontend so
-- faz SELECT nessas tabelas. Logo, restringir escrita do cliente NAO quebra nada.
-- ============================================================================

-- accounts: trocar politica ALL por SELECT-only (cliente le o proprio saldo).
DROP POLICY IF EXISTS "accounts: own data" ON public.accounts;
CREATE POLICY "accounts: select own" ON public.accounts
  FOR SELECT USING (auth.uid() = user_id);

-- operations: trocar politica ALL por SELECT-only (cliente le as proprias operacoes).
DROP POLICY IF EXISTS "operations: own data" ON public.operations;
CREATE POLICY "operations: select own" ON public.operations
  FOR SELECT USING (
    account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  );

-- transactions: ja era SELECT-only via RLS; mantida.

-- Defesa em profundidade: remover grants de escrita no nivel da tabela.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.accounts, public.operations, public.transactions
  FROM anon, authenticated;

-- ============================================================================
-- PARTE B — APLICAR SOMENTE NO DEPLOY (depois que o novo web+api estiverem no ar)
-- O frontend ANTIGO em producao ainda chama estas RPCs para abrir/liquidar.
-- Revogar antes do deploy do novo frontend quebraria o trading ao vivo.
-- O novo frontend abre via POST /operations e nao usa mais estas RPCs.
-- ============================================================================

-- REVOKE EXECUTE ON FUNCTION public.place_trade(uuid, text, text, text, numeric, numeric, numeric, timestamptz) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.settle_trade(uuid, numeric) FROM anon, authenticated;
-- REVOKE EXECUTE ON FUNCTION public.early_close_trade(uuid, numeric) FROM anon, authenticated;
