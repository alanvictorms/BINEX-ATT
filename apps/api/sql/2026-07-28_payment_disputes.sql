-- Aplicado em producao (Supabase yilmbwrfaljxgvsygmyz) em 28/07/2026
-- via MCP apply_migration, nome: payment_disputes_med
--
-- Disputas de pagamento (MED do Pix, via BSPay).
--
-- O MED (Mecanismo Especial de Devolucao) do BACEN permite que o pagador
-- conteste um Pix. Quando isso acontece, a BSPay BLOQUEIA o valor no saldo e
-- da 7 dias corridos pra defesa; sem resposta no prazo, a disputa e perdida
-- por revelia e o valor volta pro pagador.
--
-- Ate agora esses webhooks (chargeback.*) chegavam no /api/payments/pix/webhook
-- e eram descartados em silencio: o endpoint so tratava cashin.confirmed.
-- Esta tabela e o registro duravel deles.
--
-- DDL aditiva: cria objetos novos, nao altera nem remove nada existente.

create table if not exists public.payment_disputes (
  id                   uuid primary key default gen_random_uuid(),
  -- Chave de deduplicacao: a BSPay reentrega o mesmo evento ate 6x com backoff.
  dedup_key            text not null unique,
  event                text not null,          -- chargeback.opened | .responded | .won | .lost | ...
  status               text not null,          -- open | responded | confirmed | won | lost | canceled
  external_id          text,                   -- nosso external_id (liga em deposits)
  bspay_transaction_id text,
  deposit_id           uuid references public.deposits(id) on delete set null,
  user_id              uuid,
  amount               numeric,
  reason               text,                   -- REFUND_REQUEST | FRAUD
  deadline_at          timestamptz,            -- prazo de defesa (7 dias corridos)
  payload              jsonb not null,         -- envelope cru, pra auditoria
  created_at           timestamptz not null default now()
);

create index if not exists payment_disputes_status_idx   on public.payment_disputes (status, created_at desc);
create index if not exists payment_disputes_external_idx on public.payment_disputes (external_id);
create index if not exists payment_disputes_deposit_idx  on public.payment_disputes (deposit_id);

-- RLS ligada e SEM policy: ninguem le/escreve pelo client. Quem escreve e o
-- webhook (service role, que ignora RLS) e quem le e o RPC abaixo.
alter table public.payment_disputes enable row level security;

create or replace function public.admin_list_disputes(p_limit int default 100, p_offset int default 0)
returns setof public.payment_disputes
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'acesso negado';
  end if;
  return query
    select * from public.payment_disputes
    order by created_at desc
    limit  greatest(coalesce(p_limit, 100), 0)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all     on function public.admin_list_disputes(int, int) from public, anon;
grant  execute on function public.admin_list_disputes(int, int) to authenticated;
