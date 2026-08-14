-- Rollover: bloqueio total ate cumprir + conserto do extrato.
--
-- DECISAO DO FOUNDER (06/08): o saque fica bloqueado ate o rollover bater — inclusive
-- sobre o valor depositado. E o que o Regulamento de Bonus ja publica na secao 2
-- ("Enquanto o rollover nao e cumprido, o saque fica bloqueado — inclusive sobre o
-- valor que voce depositou. Se voce nao quer essa restricao, recuse o bonus.").
-- O codigo era MAIS generoso que o regulamento: so travava a parcela do bonus.
-- Multiplicador confirmado em 20x; o regulamento e que sera atualizado (dizia 10x).
--
-- Tres defeitos encontrados na investigacao entram junto, porque sem eles a trava
-- decidiria em cima de dado quebrado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) O CONTADOR ESTAVA CONGELADO PARA QUEM MAIS IMPORTA
--
--    sync_bonus_rollover comecava com:
--      if not found or v_profile.bonus_balance <= 0 then return; end if;
--
--    Quem ja gastou o bonus (que e a regra, nao a excecao) nunca tinha o
--    rollover_completed atualizado. O contador ficava em R$ 0 para sempre.
--
--    Caso real: ROSERVAL, rollover exigido R$ 2.000, contador mostrando R$ 0,
--    volume real operado R$ 17.185 — 8,6x o exigido. Levou 4 rejeicoes por
--    "ROLLOVER PENDENTE". Medicao de 06/08: de 23 clientes com obrigacao, 2 ja
--    tinham cumprido e apareciam como inadimplentes.
--
--    Passa a sincronizar por OBRIGACAO (rollover_required > 0), nao por saldo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_bonus_rollover(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_profile profiles%rowtype;
  v_volume  numeric;
begin
  select * into v_profile from profiles where id = p_user_id for update;
  if not found then return; end if;

  -- Sem obrigacao de rollover nao ha o que sincronizar.
  if coalesce(v_profile.rollover_required, 0) <= 0 then return; end if;

  select coalesce(sum(o.amount), 0) into v_volume
  from operations o
  join accounts a on a.id = o.account_id
  where a.user_id = p_user_id
    and a.type = 'REAL'
    and o.created_at >= coalesce(v_profile.bonus_granted_at, 'epoch'::timestamptz);

  if v_volume >= v_profile.rollover_required then
    -- Cumprido: libera o bonus (vira saldo comum) e trava o contador no exigido.
    update profiles
       set bonus_balance = 0,
           rollover_completed = rollover_required
     where id = p_user_id;
  else
    update profiles
       set rollover_completed = v_volume
     where id = p_user_id;
  end if;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) A TRAVA DO SAQUE
--
--    Antes: bloqueava so a PARCELA DO BONUS (sacavel = saldo - bonus_balance), e
--    a checagem inteira era pulada quando bonus_balance = 0. Como o bonus some
--    assim que o cliente opera, na pratica quase ninguem era barrado — os pedidos
--    chegavam na fila e eram rejeitados a mao (70 rejeicoes ate 06/08).
--
--    Agora: obrigacao em aberto bloqueia o saque inteiro, como o regulamento diz.
--    A mensagem mostra quanto falta e quanto ja foi feito, pra nao virar ticket.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_account_id uuid, p_amount numeric, p_pix_key_type text, p_pix_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
declare
  v_balance   numeric;
  v_user_id   uuid;
  v_wid       uuid;
  v_required  numeric;
  v_done      numeric;
  v_remaining numeric;
  v_min       numeric;
  v_max       numeric;
begin
  select balance, user_id into v_balance, v_user_id
  from accounts
  where id = p_account_id and type = 'REAL';

  if not found then
    raise exception 'Conta não encontrada';
  end if;

  if v_user_id <> auth.uid() then
    raise exception 'Sem permissão';
  end if;

  v_min := coalesce((select (value #>> '{}')::numeric from public.app_config where key='withdrawalMin'), 50);
  v_max := coalesce((select (value #>> '{}')::numeric from public.app_config where key='withdrawalMax'), 999999999);

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor de retirada inválido';
  end if;
  if p_amount < v_min then
    raise exception 'Valor mínimo de retirada: R$ %', to_char(v_min, 'FM999G999G990D00');
  end if;
  if p_amount > v_max then
    raise exception 'Valor máximo de retirada: R$ %', to_char(v_max, 'FM999G999G990D00');
  end if;

  if v_balance < p_amount then
    raise exception 'Saldo insuficiente';
  end if;

  -- ── Rollover: obrigacao em aberto bloqueia o saque inteiro ────────────────
  perform public.sync_bonus_rollover(v_user_id);

  select coalesce(rollover_required, 0), coalesce(rollover_completed, 0)
    into v_required, v_done
  from profiles where id = v_user_id;

  v_remaining := greatest(v_required - v_done, 0);

  if v_remaining > 0 then
    raise exception 'Saque bloqueado pelo rollover do bônus. Falta operar R$ % em volume. Você já operou R$ % dos R$ % exigidos.',
      to_char(v_remaining, 'FM999G999G990D00'),
      to_char(v_done,      'FM999G999G990D00'),
      to_char(v_required,  'FM999G999G990D00');
  end if;

  -- Bloqueia o saldo (debita imediatamente, devolve se rejeitado/cancelado)
  update accounts set balance = balance - p_amount where id = p_account_id;

  insert into withdrawals (user_id, account_id, amount, pix_key_type, pix_key)
  values (v_user_id, p_account_id, p_amount, p_pix_key_type, p_pix_key)
  returning id into v_wid;

  insert into transactions (account_id, type, amount, description)
  values (p_account_id, 'WITHDRAWAL', -p_amount, 'Solicitação de retirada via PIX');

  return v_wid;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) O EXTRATO NAO REGISTRAVA A DEVOLUCAO
--
--    request_withdrawal grava WITHDRAWAL -R$ X e debita o saldo. Quando o saque
--    era rejeitado ou cancelado, o dinheiro voltava para accounts.balance e
--    NENHUM credito era lancado. Da tela do cliente, o dinheiro saia e nunca
--    voltava.
--
--    Reconciliacao de 06/08: a diferenca entre saldo e soma do extrato bateu
--    EXATAMENTE com a soma dos saques rejeitados/cancelados, com R$ 0,00 de sobra
--    em todos os clientes reais. Miqueias tinha R$ 5.254 de saque debitado sem
--    contrapartida no extrato; josilucas, R$ 2.253.
--
--    Provavel origem real das reclamacoes — nao o rollover.
--
--    Tipo do lancamento: 'WITHDRAWAL' com valor POSITIVO. transactions.type e
--    TEXT + CHECK e nao tem valor de estorno na lista; usar o mesmo tipo com
--    sinal invertido mantem o extrato somavel sem alterar a constraint.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  p_withdrawal_id uuid, p_action text, p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_w withdrawals%ROWTYPE;
  v_kyc text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  SELECT * INTO v_w FROM public.withdrawals
  WHERE id = p_withdrawal_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retirada não encontrada ou já processada';
  END IF;

  IF p_action = 'approve' THEN
    PERFORM public.require_recent_mfa(300);
    SELECT kyc_status INTO v_kyc FROM public.profiles WHERE id = v_w.user_id;
    IF v_kyc <> 'verified' THEN
      RAISE EXCEPTION 'Usuário precisa estar com KYC verificado antes de aprovar saque (atual: %)', v_kyc;
    END IF;
    UPDATE public.withdrawals SET status = 'approved', admin_notes = p_notes, processed_at = now()
    WHERE id = p_withdrawal_id;
    PERFORM public.log_admin_action('approve_withdrawal','withdrawal', p_withdrawal_id,
      jsonb_build_object('status','pending','amount',v_w.amount),
      jsonb_build_object('status','approved'), p_notes);

  ELSIF p_action = 'reject' THEN
    UPDATE public.withdrawals SET status = 'rejected', admin_notes = p_notes, processed_at = now()
    WHERE id = p_withdrawal_id;
    UPDATE public.accounts SET balance = balance + v_w.amount WHERE id = v_w.account_id;

    -- NOVO: a devolucao aparece no extrato do cliente.
    INSERT INTO public.transactions (account_id, type, amount, description)
    VALUES (v_w.account_id, 'WITHDRAWAL', v_w.amount,
            'Retirada não aprovada — valor devolvido ao saldo');

    PERFORM public.log_admin_action('reject_withdrawal','withdrawal', p_withdrawal_id,
      jsonb_build_object('status','pending','amount',v_w.amount),
      jsonb_build_object('status','rejected','refunded',v_w.amount), p_notes);
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) cancel_withdrawal — estorno de verdade + FOR UPDATE
--
--    Dois problemas alem da falta de lancamento:
--
--    a) Em vez de estornar, ele RENOMEAVA a descricao do lancamento original
--       ('Retirada cancelada (estornada)') deixando o valor NEGATIVO. O extrato
--       continuava mostrando saida. E o UPDATE nao tinha ancora de id — casava
--       por descricao numa janela de 5 segundos, entao podia renomear o
--       lancamento de OUTRO saque feito no mesmo instante.
--
--    b) Sem FOR UPDATE no SELECT (P0 da auditoria de 21/07): duas chamadas
--       simultaneas passavam as duas pelo teste de status='pending' e creditavam
--       o valor duas vezes. Estorno duplo cria dinheiro do nada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(p_withdrawal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_w withdrawals%ROWTYPE;
BEGIN
  SELECT * INTO v_w FROM public.withdrawals
  WHERE id = p_withdrawal_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retirada não encontrada ou já processada';
  END IF;

  IF v_w.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.withdrawals SET status = 'cancelled', processed_at = now()
  WHERE id = p_withdrawal_id;

  UPDATE public.accounts SET balance = balance + v_w.amount WHERE id = v_w.account_id;

  INSERT INTO public.transactions (account_id, type, amount, description)
  VALUES (v_w.account_id, 'WITHDRAWAL', v_w.amount,
          'Retirada cancelada — valor devolvido ao saldo');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- NAO ENTRA NESTA MIGRATION (decisao do founder em 06/08)
--
--   Os 7 perfis com rollover_required > 0 que nunca receberam bonus
--   (bonus_granted_at NULL, deposits.bonus_amount = 0, nenhum lancamento BONUS,
--   reconciliacao de saldo fechando sem sobra) permanecem com a cobranca.
--   rollover_required / 20 devolve exatamente 300/100/100/100/100/100/50 — os
--   valores de bonus que o sistema calculou e cujo credito nao chegou.
--   Total para regularizar seria R$ 850. Fica registrado aqui porque a trava do
--   item 2 passa a segurar o saldo dessas contas (~R$ 1.250, concentrado em
--   josilucas R$ 1.027 e julio R$ 224).
-- ─────────────────────────────────────────────────────────────────────────────
