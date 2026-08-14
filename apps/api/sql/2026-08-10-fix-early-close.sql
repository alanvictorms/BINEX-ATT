-- ─────────────────────────────────────────────────────────────────────────────
-- P0 — "Vender agora" devolvia 80% fixo do stake. Achado em 10/08/2026.
--
-- O QUE ESTAVA ACONTECENDO
-- A tela promete uma coisa e o servidor pagava outra:
--
--   TradingPanel.tsx:131   earlyExitValue = max(1, round(amount * 0.20 * decay))
--                          decay = tempo_restante / duracao   -> 20% caindo a zero
--
--   early_close_trade      v_refund := ROUND(v_op.amount * 0.80, 2)
--                          80% fixo, ignorando o p_refund_amount do cliente,
--                          ignorando se ele estava ganhando ou perdendo, e
--                          liberado ate 5s do vencimento.
--
-- Numa operacao de R$500 com 11s restantes o botao anunciava "R$ 18" e o banco
-- creditava R$ 400. Vinte e duas vezes o prometido.
--
-- POR QUE ISSO ERA FATAL
-- Payout de 87% na vitoria e prejuizo travado em 20% na derrota. Taxa de acerto
-- necessaria pra empatar: 0,20 / (0,87 + 0,20) = 18,7%. Qualquer pessoa jogando
-- perto de 50% tirava ~33% de lucro sobre todo o volume apostado. Bastava abrir
-- a operacao, assistir a vela e apertar "Vender agora" quando estava perdendo.
--
-- E foi exatamente o que aconteceu: 98 saidas antecipadas, 8 usuarios,
-- R$ 19.825 devolvidos onde a regra da tela devolveria R$ 2.417.
-- Vazamento de R$ 17.408. Um unico lead respondeu por R$ 12.762 disso, com
-- 43 saidas a uma media de 48,7s de operacoes de 60s.
--
-- A CORRECAO
-- O servidor passa a calcular exatamente o que a tela mostra. A promessa do
-- botao vira verdade e o exploit morre: o maximo que o cliente recupera e 20%
-- do stake, e so no primeiro instante da operacao.
--
-- A janela de 5s tambem sobe pro servidor (a UI ja bloqueava em canAct, mas
-- so na UI — quem chamasse a RPC direto passava por cima). Uso "< 5" e nao
-- "<= 5" pra dar ~1s de folga contra diferenca de relogio entre navegador e
-- banco, senao o cliente clica num botao habilitado e leva erro.
--
-- Assinatura preservada: p_refund_amount continua existindo e continua sendo
-- ignorado. O frontend em producao passa esse parametro — mudar a assinatura
-- quebraria o app antes do deploy do web.
--
-- Aproveitando que a funcao esta sendo reescrita: search_path fixo. SECURITY
-- DEFINER sem search_path e o advisory classico do Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.early_close_trade(p_operation_id uuid, p_refund_amount numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_op        public.operations;
  v_refund    numeric;
  v_duracao   numeric;
  v_restante  numeric;
BEGIN
  SELECT * INTO v_op FROM public.operations
  WHERE id = p_operation_id
    AND status = 'OPEN'
    AND account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_NOT_FOUND'; END IF;

  v_duracao  := EXTRACT(EPOCH FROM (v_op.expires_at - v_op.created_at));
  v_restante := EXTRACT(EPOCH FROM (v_op.expires_at - now()));

  -- Sem os ultimos 5s e sem operacao ja vencida: perto do fim a saida
  -- antecipada vira desfazer aposta com o resultado quase na mao.
  IF v_duracao IS NULL OR v_duracao <= 0 THEN RAISE EXCEPTION 'OPERATION_INVALID_DURATION'; END IF;
  IF v_restante < 5 THEN RAISE EXCEPTION 'EARLY_CLOSE_WINDOW_CLOSED'; END IF;

  -- Mesma formula do botao (TradingPanel.tsx:131), inclusive o arredondamento
  -- pra real inteiro e o piso de R$ 1. Teto real: 20% do stake, nunca mais.
  v_refund := GREATEST(1, ROUND(v_op.amount * 0.20 * LEAST(1, v_restante / v_duracao)));
  v_refund := LEAST(v_refund, v_op.amount);  -- trava dura: nunca devolve mais que a entrada

  UPDATE public.operations
  SET status = 'LOST', profit = -(v_op.amount - v_refund),
      closed_at = now(), exit_price = v_op.entry_price, exit_price_source = 'SERVER'
  WHERE id = p_operation_id;

  UPDATE public.accounts SET balance = balance + v_refund WHERE id = v_op.account_id;

  INSERT INTO public.transactions (account_id, type, amount, description, operation_id)
  VALUES (v_op.account_id, 'EARLY_CLOSE', v_refund,
          'Saída antecipada: devolvido R$ ' || v_refund::text, p_operation_id);

  RETURN json_build_object('ok', true, 'refund', v_refund);
END;
$function$;
