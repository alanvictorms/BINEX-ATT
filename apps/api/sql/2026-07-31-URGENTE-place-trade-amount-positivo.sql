-- URGENTE — place_trade aceita valor NEGATIVO e infla o saldo REAL.
--
-- COMO O BURACO FUNCIONA
--   O place_trade valida payout, frescor do preço, dono da conta e saldo —
--   mas nunca valida que p_amount é positivo. Com p_amount = -100000:
--
--     IF v_balance < p_amount        -- 0 < -100000  → falso, passa
--     UPDATE accounts SET balance = balance - p_amount   -- balance + 100000
--
--   O REVOKE de 28/07 tirou só o `anon`. O papel `authenticated` continua com
--   EXECUTE, então qualquer usuário logado chama isso do console do navegador
--   com a própria anon key. Vale em conta REAL.
--
-- POR QUE O CHECK RESOLVE SOZINHO
--   O place_trade debita a conta e insere em `operations` na MESMA transação,
--   gravando p_amount na coluna amount. Um CHECK (amount > 0) faz o INSERT
--   estourar, a função inteira sofre rollback e o saldo volta. Fecha o buraco
--   por qualquer caminho de código, sem precisar reescrever a função.
--
-- ORDEM: rode o passo 1, olhe o resultado, depois rode o passo 2.

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — Diagnóstico: alguém já explorou?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*)                                        AS operacoes_com_valor_invalido,
  min(amount)                                     AS menor_valor,
  min(created_at)                                 AS primeira_ocorrencia,
  count(DISTINCT account_id)                      AS contas_envolvidas
FROM public.operations
WHERE amount <= 0;

-- Se o count acima for > 0, liste as contas antes de seguir — vai precisar
-- estornar o saldo inflado à mão:
--
--   SELECT o.account_id, a.user_id, a.type, count(*), sum(o.amount)
--   FROM public.operations o JOIN public.accounts a ON a.id = o.account_id
--   WHERE o.amount <= 0 GROUP BY 1,2,3 ORDER BY 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — A trava. Aditiva, instantânea, sem lock de tabela.
-- ─────────────────────────────────────────────────────────────────────────────
-- NOT VALID: aplica a toda linha NOVA sem varrer o histórico. É de propósito —
-- se já houver linha ruim, a constraint com validação falharia e deixaria o
-- buraco aberto enquanto você investiga. Fechar primeiro, limpar depois.
ALTER TABLE public.operations
  ADD CONSTRAINT operations_amount_positive CHECK (amount > 0) NOT VALID;

-- Depois de limpar as linhas do passo 1 (se houver), valide o histórico:
--   ALTER TABLE public.operations VALIDATE CONSTRAINT operations_amount_positive;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 3 — Confirmar que fechou
-- ─────────────────────────────────────────────────────────────────────────────
-- Logado como usuário comum, no console do navegador:
--
--   await supabase.rpc('place_trade', {
--     p_account_id: '<id da sua conta REAL>', p_asset_id: 'btc-usd-otc',
--     p_asset_symbol: 'BTC/USD (OTC)', p_direction: 'CALL',
--     p_amount: -100000, p_payout_pct: 85, p_entry_price: 0,
--     p_expires_at: new Date(Date.now() + 60000).toISOString(),
--   })
--
-- Esperado: erro de violação da constraint operations_amount_positive.
-- Se o saldo subir, a constraint não foi aplicada — pare e verifique.

-- ─────────────────────────────────────────────────────────────────────────────
-- DEPOIS (não é urgente, é higiene)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) No próximo CREATE OR REPLACE do place_trade, colocar logo no começo:
--
--      IF p_amount IS NULL OR p_amount <= 0 THEN
--        RAISE EXCEPTION 'INVALID_AMOUNT';
--      END IF;
--
--    Dá erro limpo em vez de violação de constraint. A trava acima continua
--    valendo como rede — defesa na tabela sobrevive a reescrita de função.
--
-- 2) Avaliar o REVOKE de `authenticated` nas RPCs de trading. O de 28/07 tirou
--    só o anon, com a justificativa de que as funções checam auth.uid() — o que
--    é verdade, mas não protege contra parâmetro inválido, que é exatamente
--    este caso.
