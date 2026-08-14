-- Aplicado em producao (Supabase yilmbwrfaljxgvsygmyz) em 28/07/2026
-- via MCP apply_migration, nome: set_own_cpf
--
-- CPF do pagador, gravado pelo proprio usuario na tela de deposito.
--
-- Por que RPC e nao policy de UPDATE em profiles: a tabela hoje so tem
-- "profiles: select own". Abrir UPDATE liberaria o usuario a escrever QUALQUER
-- coluna do proprio perfil. Esta funcao escreve exclusivamente `cpf`.
--
-- Regras:
--  - so grava se o CPF ainda estiver vazio. Trocar CPF depois de definido muda
--    a identidade do pagador — isso e acao de admin, nao do proprio usuario.
--  - valida os digitos verificadores no servidor tambem, nao so no cliente.
--    (verificacao de identidade de verdade continua sendo o KYC.)
--
-- DDL aditiva: cria funcoes novas, nao altera nem remove nada existente.

create or replace function public.cpf_valido(p_cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text;
  s int;
  i int;
  dv1 int;
  dv2 int;
begin
  d := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  if length(d) <> 11 then return false; end if;
  if d ~ '^(.)\1{10}$' then return false; end if;

  s := 0;
  for i in 1..9 loop
    s := s + substr(d, i, 1)::int * (11 - i);
  end loop;
  dv1 := (s * 10) % 11;
  if dv1 = 10 then dv1 := 0; end if;
  if dv1 <> substr(d, 10, 1)::int then return false; end if;

  s := 0;
  for i in 1..10 loop
    s := s + substr(d, i, 1)::int * (12 - i);
  end loop;
  dv2 := (s * 10) % 11;
  if dv2 = 10 then dv2 := 0; end if;

  return dv2 = substr(d, 11, 1)::int;
end;
$$;

create or replace function public.set_own_cpf(p_cpf text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d   text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  atual text;
begin
  if uid is null then
    raise exception 'nao autenticado';
  end if;
  if not public.cpf_valido(d) then
    raise exception 'CPF invalido';
  end if;

  select cpf into atual from public.profiles where id = uid;

  -- Ja definido: so aceita reenvio do MESMO valor (idempotente). Alterar exige admin.
  if atual is not null and length(trim(atual)) > 0 then
    return regexp_replace(atual, '\D', '', 'g') = d;
  end if;

  update public.profiles set cpf = d where id = uid;
  return true;
end;
$$;

revoke all     on function public.set_own_cpf(text) from public, anon;
grant  execute on function public.set_own_cpf(text) to authenticated;

-- Conferido apos aplicar:
--   529.982.247-25 -> true    111.111.111-11 -> false
--   111.444.777-35 -> true    529.982.247-24 -> false (DV errado)
--   12345678909    -> true    '123' / null   -> false
