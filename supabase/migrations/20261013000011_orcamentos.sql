-- =====================================================================
-- Orçamentos de reforma de camisas: catálogo de serviços, orçamentos com
-- itens, fotos e status configuráveis.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo de serviços (tabela de valores)
-- ---------------------------------------------------------------------
create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  detalhe text,                         -- ex.: "frente", "verso", "par"
  valor numeric(12, 2) not null check (valor >= 0),
  a_partir_de boolean not null default false, -- valor mínimo; ajustável no orçamento
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.servicos (ordem, nome, detalhe, valor, a_partir_de) values
  (1,  'Limpeza/Remoção de patrocínios', 'frente', 40, false),
  (2,  'Limpeza/Remoção de patrocínios', 'verso', 40, false),
  (3,  'Escudo', null, 45, false),
  (4,  'Logo', null, 30, false),
  (5,  'Peito', null, 30, false),
  (6,  'Omoplatas', 'par', 30, false),
  (7,  'Mangas', 'par', 40, false),
  (8,  'Master frontal', '1 cor', 30, false),
  (9,  'Master frontal', 'colorido', 45, false),
  (10, 'Master costa', '1 cor', 30, false),
  (11, 'Master costa', 'colorido', 45, false),
  (12, 'Barra camisa', 'frente ou verso', 30, false),
  (13, 'Nome + número', null, 40, false),
  (14, 'Patch', null, 35, false),
  (15, 'Estampas/Personalizações', null, 40, true);

-- ---------------------------------------------------------------------
-- Status (configuráveis: novos status podem ser ativados ou criados)
-- ---------------------------------------------------------------------
create table public.orcamento_status (
  codigo text primary key check (codigo ~ '^[a-z0-9_]+$'),
  rotulo text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  sistema boolean not null default false -- "pendente" não pode ser desativado
);

insert into public.orcamento_status (codigo, rotulo, ordem, ativo, sistema) values
  ('pendente', 'Pendente', 1, true, true),
  ('aprovado', 'Aprovado', 2, true, false),
  ('a_fazer', 'A fazer', 3, false, false),
  ('lavagem', 'Lavagem', 4, false, false),
  ('aguardando_material', 'Aguardando material', 5, false, false),
  ('pronta_retirada', 'Pronta para retirada', 6, false, false),
  ('recusado', 'Recusado', 90, true, false);

-- ---------------------------------------------------------------------
-- Orçamentos
-- ---------------------------------------------------------------------
create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  numero integer generated always as identity unique,
  cliente_nome text not null check (length(trim(cliente_nome)) > 0),
  contato text,                          -- telefone ou @instagram
  fotos text[] not null default '{}',    -- caminhos no armazenamento
  observacoes text,                      -- anotações internas
  status text not null default 'pendente' references public.orcamento_status (codigo),
  total numeric(12, 2) not null default 0,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index orcamentos_status_idx on public.orcamentos (status, criado_em desc);

create table public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  servico_id uuid references public.servicos (id),  -- null = item personalizado
  descricao text not null check (length(trim(descricao)) > 0),
  quantidade integer not null default 1 check (quantidade > 0),
  valor_unitario numeric(12, 2) not null check (valor_unitario >= 0),
  total numeric(12, 2) generated always as (quantidade * valor_unitario) stored,
  ordem integer not null default 0
);
create index orcamento_itens_orcamento_idx on public.orcamento_itens (orcamento_id);

create table public.orcamento_historico (
  id bigint generated always as identity primary key,
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  status_anterior text,
  status_novo text not null,
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- Cria ou atualiza o orçamento e seus itens numa única transação.
-- Orçamento novo sempre começa como "pendente".
create function public.salvar_orcamento(p_id uuid, p_dados jsonb, p_itens jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
  it record;
  k integer := 0;
begin
  perform public.exigir_usuario();
  if coalesce(trim(p_dados ->> 'cliente_nome'), '') = '' then raise exception 'Informe o nome do cliente'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Selecione ao menos um serviço';
  end if;

  if v_id is null then
    insert into public.orcamentos (cliente_nome, contato, fotos, observacoes)
    values (trim(p_dados ->> 'cliente_nome'), nullif(trim(p_dados ->> 'contato'), ''),
            coalesce(array(select jsonb_array_elements_text(p_dados -> 'fotos')), '{}'),
            nullif(trim(p_dados ->> 'observacoes'), ''))
    returning id into v_id;
    insert into public.orcamento_historico (orcamento_id, status_novo) values (v_id, 'pendente');
  else
    update public.orcamentos set
      cliente_nome = trim(p_dados ->> 'cliente_nome'),
      contato = nullif(trim(p_dados ->> 'contato'), ''),
      fotos = coalesce(array(select jsonb_array_elements_text(p_dados -> 'fotos')), '{}'),
      observacoes = nullif(trim(p_dados ->> 'observacoes'), ''),
      atualizado_em = now()
    where id = v_id;
    if not found then raise exception 'Orçamento não encontrado'; end if;
    delete from public.orcamento_itens where orcamento_id = v_id;
  end if;

  for it in
    select (x ->> 'servico_id')::uuid as servico_id,
           nullif(trim(x ->> 'descricao'), '') as descricao,
           coalesce((x ->> 'quantidade')::integer, 1) as quantidade,
           (x ->> 'valor_unitario')::numeric as valor
    from jsonb_array_elements(p_itens) x
  loop
    if it.descricao is null then raise exception 'Item sem descrição'; end if;
    if it.valor is null or it.valor < 0 or it.valor <> round(it.valor, 2) then
      raise exception 'Valor inválido em %', it.descricao;
    end if;
    k := k + 1;
    insert into public.orcamento_itens (orcamento_id, servico_id, descricao, quantidade, valor_unitario, ordem)
    values (v_id, it.servico_id, it.descricao, it.quantidade, it.valor, k);
  end loop;

  update public.orcamentos
     set total = (select coalesce(sum(total), 0) from public.orcamento_itens where orcamento_id = v_id)
   where id = v_id;
  return v_id;
end $$;

create function public.alterar_status_orcamento(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ant text;
begin
  perform public.exigir_usuario();
  if not exists (select 1 from public.orcamento_status where codigo = p_status and ativo) then
    raise exception 'Status inválido ou inativo';
  end if;
  select status into v_ant from public.orcamentos where id = p_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if v_ant = p_status then return; end if;
  update public.orcamentos set status = p_status, atualizado_em = now() where id = p_id;
  insert into public.orcamento_historico (orcamento_id, status_anterior, status_novo) values (p_id, v_ant, p_status);
end $$;

-- Configuração (administradores): serviços e status.
create function public.salvar_servico(p_id uuid, p_nome text, p_detalhe text, p_valor numeric, p_a_partir_de boolean, p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform public.exigir_admin();
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do serviço'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor inválido'; end if;
  if v_id is null then
    insert into public.servicos (nome, detalhe, valor, a_partir_de, ativo, ordem)
    values (trim(p_nome), nullif(trim(p_detalhe), ''), p_valor, coalesce(p_a_partir_de, false), coalesce(p_ativo, true),
            coalesce((select max(ordem) + 1 from public.servicos), 1))
    returning id into v_id;
  else
    update public.servicos set nome = trim(p_nome), detalhe = nullif(trim(p_detalhe), ''), valor = p_valor,
           a_partir_de = coalesce(p_a_partir_de, false), ativo = coalesce(p_ativo, true)
    where id = v_id;
    if not found then raise exception 'Serviço não encontrado'; end if;
  end if;
  return v_id;
end $$;

create function public.salvar_status_orcamento(p_codigo text, p_rotulo text, p_ativo boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_cod text := p_codigo;
begin
  perform public.exigir_admin();
  if coalesce(trim(p_rotulo), '') = '' then raise exception 'Informe o nome do status'; end if;
  if v_cod is null then
    -- Código a partir do nome: "Aguardando cliente" → aguardando_cliente
    v_cod := trim(both '_' from regexp_replace(lower(translate(trim(p_rotulo),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^a-z0-9]+', '_', 'g'));
    if v_cod = '' then raise exception 'Nome de status inválido'; end if;
    if exists (select 1 from public.orcamento_status where codigo = v_cod or lower(rotulo) = lower(trim(p_rotulo))) then
      raise exception 'Já existe um status chamado %', trim(p_rotulo);
    end if;
    insert into public.orcamento_status (codigo, rotulo, ordem, ativo)
    values (v_cod, trim(p_rotulo), coalesce((select max(ordem) from public.orcamento_status where codigo <> 'recusado'), 0) + 1,
            coalesce(p_ativo, true));
  else
    if v_cod = 'pendente' and p_ativo is false then raise exception 'O status Pendente não pode ser desativado'; end if;
    update public.orcamento_status set rotulo = trim(p_rotulo), ativo = coalesce(p_ativo, true) where codigo = v_cod;
    if not found then raise exception 'Status não encontrado'; end if;
  end if;
  return v_cod;
end $$;

revoke execute on function public.salvar_orcamento, public.alterar_status_orcamento, public.salvar_servico,
  public.salvar_status_orcamento from public, anon;
grant execute on function public.salvar_orcamento, public.alterar_status_orcamento, public.salvar_servico,
  public.salvar_status_orcamento to authenticated;

alter table public.servicos enable row level security;
alter table public.orcamento_status enable row level security;
alter table public.orcamentos enable row level security;
alter table public.orcamento_itens enable row level security;
alter table public.orcamento_historico enable row level security;
create policy leitura on public.servicos for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.orcamento_status for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.orcamentos for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.orcamento_itens for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.orcamento_historico for select to authenticated using (public.papel_atual() is not null);
