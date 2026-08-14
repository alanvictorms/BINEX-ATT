-- APLICADO em producao 2026-08-06 via MCP. Duas migrations:
--   `extrato_registra_ajuste_e_estorno_admin`
--   `extrato_fecha_ultimos_tres_furos`
--
-- Fecha TODOS os caminhos que mexiam em accounts.balance sem escrever em
-- transactions. Continuacao de 2026-08-06-rollover-e-extrato.sql, que ja tinha
-- consertado admin_process_withdrawal e cancel_withdrawal.
--
-- POR QUE IMPORTA: transactions e o extrato que o cliente ve em /conta e a fonte do
-- painel Carteira. Credito invisivel ali significa que o saldo do cliente muda sem
-- explicacao — e no caso do saque rejeitado, significa que a tela dele mostra o
-- dinheiro saindo e nunca voltando. Foi o que a reconciliacao de 06/08 encontrou:
-- a diferenca entre saldo e soma do extrato batia exatamente com os saques
-- rejeitados/cancelados, R$ 0,00 de sobra em todos os clientes reais.

-- ─────────────────────────────────────────────────────────────────────────────
-- TIPO NOVO: 'ADJUSTMENT'
--
-- transactions.type e TEXT + CHECK (nao enum). Nenhum tipo existente descreve
-- "o suporte mexeu no saldo": usar DEPOSIT ou BONUS mentiria sobre a origem do
-- dinheiro no extrato do cliente. Widening puro — toda linha existente segue valida.
-- Tabela com 27.310 linhas / 7,3 MB, validacao instantanea.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type = ANY (ARRAY[
    'DEPOSIT','WITHDRAWAL','TRADE_WIN','TRADE_LOSS','TRADE_DRAW','EARLY_CLOSE',
    'DEMO_RESET','BONUS','COPY_PURCHASE','COPY_RESULT','BOOSTER_PURCHASE','ADJUSTMENT'
  ]));

-- ─────────────────────────────────────────────────────────────────────────────
-- AS SEIS FUNCOES E O LANCAMENTO QUE CADA UMA PASSOU A ESCREVER
--
--   admin_process_withdrawal (reject)  WITHDRAWAL +valor  "Retirada não aprovada — valor devolvido ao saldo"
--   cancel_withdrawal                  WITHDRAWAL +valor  "Retirada cancelada — valor devolvido ao saldo"
--   settle_bspay_payout (failed)       WITHDRAWAL +valor  "Retirada não concluída pelo banco — valor devolvido ao saldo"
--   admin_adjust_balance               ADJUSTMENT +-delta "Ajuste de saldo: <motivo>"
--   admin_void_operation               ADJUSTMENT +-delta "Operação estornada pelo suporte: <motivo>"
--   admin_update_operation_status      ADJUSTMENT +-delta "Resultado da operação corrigido pelo suporte: <motivo>"
--   admin_reset_demo                   DEMO_RESET +-delta "Conta de demonstração reiniciada para R$ 10.000,00"
--
-- Devolucao de saque usa 'WITHDRAWAL' com valor POSITIVO em vez de um tipo novo:
-- mantem o extrato somavel e o par pedido/devolucao fica visivel na mesma linha
-- de filtro. Os tres casos de ajuste do admin usam ADJUSTMENT porque o motivo ja
-- e obrigatorio na assinatura das funcoes e vai junto na descricao — o cliente ve
-- POR QUE o saldo mudou, nao so que mudou.
--
-- admin_reset_demo tambem ganhou FOR UPDATE e passou a falhar explicitamente se a
-- conta demo nao existir (antes o UPDATE afetava 0 linhas em silencio).
--
-- O corpo completo de cada funcao esta nas migrations; aqui fica o registro do
-- racional. Verificacao rodada apos aplicar:
--
--   SELECT string_agg(p.proname, ', ')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prokind='f'
--     AND pg_get_functiondef(p.oid) ~* 'update (public\.)?accounts\s+set\s+balance'
--     AND pg_get_functiondef(p.oid) !~* 'insert into (public\.)?transactions';
--   => NENHUMA
--
-- FRONT: os dois mapas de rotulo (conta/ContaPage.tsx e admin/carteira/page.tsx)
-- nao conheciam ADJUSTMENT nem BOOSTER_PURCHASE — o fallback e `?? tx.type`, entao
-- apareceria o codigo cru. Rotulos adicionados nos dois; o de carteira alimenta
-- tambem o filtro por tipo (TYPE_FILTERS deriva do mapa).
