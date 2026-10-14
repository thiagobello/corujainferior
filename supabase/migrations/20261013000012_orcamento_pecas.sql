-- =====================================================================
-- Orçamentos com várias camisas (peças), cada uma com fotos, serviços e
-- valor próprio; serviços organizados por posição (frente/verso/outros).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Serviços por posição
-- ---------------------------------------------------------------------
alter table public.servicos
  add column grupo text not null default 'outros' check (grupo in ('frente', 'verso', 'outros'));

update public.servicos set grupo = 'frente', detalhe = null, ordem = 1
  where nome = 'Limpeza/Remoção de patrocínios' and detalhe = 'frente';
update public.servicos set grupo = 'verso', detalhe = null, ordem = 1
  where nome = 'Limpeza/Remoção de patrocínios' and detalhe = 'verso';
update public.servicos set grupo = 'frente', ordem = 2 where nome = 'Escudo';
update public.servicos set grupo = 'frente', ordem = 3 where nome = 'Logo';
update public.servicos set grupo = 'frente', ordem = 4 where nome = 'Peito';
update public.servicos set grupo = 'frente', ordem = 5 where nome = 'Omoplatas';
update public.servicos set grupo = 'frente', detalhe = 'cor única', ordem = 6 where nome = 'Master frontal' and detalhe = '1 cor';
update public.servicos set grupo = 'frente', ordem = 7 where nome = 'Master frontal' and detalhe = 'colorido';
update public.servicos set grupo = 'verso', detalhe = 'cor única', ordem = 3 where nome = 'Master costa' and detalhe = '1 cor';
update public.servicos set grupo = 'verso', ordem = 4 where nome = 'Master costa' and detalhe = 'colorido';
update public.servicos set grupo = 'verso', ordem = 2 where nome = 'Nome + número';
update public.servicos set grupo = 'outros', ordem = 1 where nome = 'Mangas';
update public.servicos set grupo = 'outros', ordem = 2 where nome = 'Patch';
update public.servicos set grupo = 'outros', ordem = 3 where nome = 'Estampas/Personalizações';

-- "Barra camisa | frente ou verso" vira dois serviços: barra frente e barra verso.
update public.servicos set nome = 'Barra', detalhe = null, grupo = 'frente', ordem = 8
  where nome = 'Barra camisa' and detalhe = 'frente ou verso';
insert into public.servicos (nome, detalhe, valor, a_partir_de, grupo, ordem)
select 'Barra', null, valor, false, 'verso', 5 from public.servicos
where nome = 'Barra' and grupo = 'frente'
  and not exists (select 1 from public.servicos where nome = 'Barra' and grupo = 'verso');

-- ---------------------------------------------------------------------
-- Peças (camisas) do orçamento
-- ---------------------------------------------------------------------
create table public.orcamento_pecas (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),   -- ex.: "Corinthians 2009"
  fotos text[] not null default '{}',
  subtotal numeric(12, 2) not null default 0,
  ordem integer not null default 0
);
create index orcamento_pecas_orcamento_idx on public.orcamento_pecas (orcamento_id, ordem);

alter table public.orcamento_itens add column peca_id uuid references public.orcamento_pecas (id) on delete cascade;

-- Orçamentos já existentes viram uma peça "Camisa" com as fotos e itens atuais.
insert into public.orcamento_pecas (orcamento_id, nome, fotos, subtotal, ordem)
select o.id, 'Camisa', o.fotos, o.total, 1 from public.orcamentos o
where not exists (select 1 from public.orcamento_pecas p where p.orcamento_id = o.id);
update public.orcamento_itens i set peca_id = p.id
from public.orcamento_pecas p where p.orcamento_id = i.orcamento_id and i.peca_id is null;
update public.orcamentos set fotos = '{}';

-- ---------------------------------------------------------------------
-- Salvar: cabeçalho + peças + itens numa única transação
-- ---------------------------------------------------------------------
-- p_pecas: [{nome, fotos: [...], itens: [{servico_id, descricao, quantidade, valor_unitario}]}]
drop function public.salvar_orcamento(uuid, jsonb, jsonb);

create function public.salvar_orcamento(p_id uuid, p_dados jsonb, p_pecas jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
  pc record;
  it record;
  v_peca uuid;
  np integer := 0;
  ni integer;
begin
  perform public.exigir_usuario();
  if coalesce(trim(p_dados ->> 'cliente_nome'), '') = '' then raise exception 'Informe o nome do cliente'; end if;
  if p_pecas is null or jsonb_typeof(p_pecas) <> 'array' or jsonb_array_length(p_pecas) = 0 then
    raise exception 'Adicione ao menos uma camisa';
  end if;

  if v_id is null then
    insert into public.orcamentos (cliente_nome, contato, observacoes)
    values (trim(p_dados ->> 'cliente_nome'), nullif(trim(p_dados ->> 'contato'), ''), nullif(trim(p_dados ->> 'observacoes'), ''))
    returning id into v_id;
    insert into public.orcamento_historico (orcamento_id, status_novo) values (v_id, 'pendente');
  else
    update public.orcamentos set
      cliente_nome = trim(p_dados ->> 'cliente_nome'),
      contato = nullif(trim(p_dados ->> 'contato'), ''),
      observacoes = nullif(trim(p_dados ->> 'observacoes'), ''),
      atualizado_em = now()
    where id = v_id;
    if not found then raise exception 'Orçamento não encontrado'; end if;
    delete from public.orcamento_pecas where orcamento_id = v_id;  -- itens saem em cascata
    delete from public.orcamento_itens where orcamento_id = v_id;
  end if;

  for pc in select x from jsonb_array_elements(p_pecas) x loop
    np := np + 1;
    if coalesce(trim(pc.x ->> 'nome'), '') = '' then raise exception 'Informe o nome da camisa %', np; end if;
    if jsonb_array_length(coalesce(pc.x -> 'itens', '[]'::jsonb)) = 0 then
      raise exception 'Selecione ao menos um serviço para %', trim(pc.x ->> 'nome');
    end if;
    insert into public.orcamento_pecas (orcamento_id, nome, fotos, ordem)
    values (v_id, trim(pc.x ->> 'nome'), coalesce(array(select jsonb_array_elements_text(pc.x -> 'fotos')), '{}'), np)
    returning id into v_peca;

    ni := 0;
    for it in
      select (y ->> 'servico_id')::uuid as servico_id,
             nullif(trim(y ->> 'descricao'), '') as descricao,
             coalesce((y ->> 'quantidade')::integer, 1) as quantidade,
             (y ->> 'valor_unitario')::numeric as valor
      from jsonb_array_elements(pc.x -> 'itens') y
    loop
      ni := ni + 1;
      if it.descricao is null then raise exception 'Item sem descrição em %', trim(pc.x ->> 'nome'); end if;
      if it.valor is null or it.valor < 0 or it.valor <> round(it.valor, 2) then
        raise exception 'Valor inválido em % (%)', it.descricao, trim(pc.x ->> 'nome');
      end if;
      insert into public.orcamento_itens (orcamento_id, peca_id, servico_id, descricao, quantidade, valor_unitario, ordem)
      values (v_id, v_peca, it.servico_id, it.descricao, it.quantidade, it.valor, ni);
    end loop;

    update public.orcamento_pecas
       set subtotal = (select coalesce(sum(total), 0) from public.orcamento_itens where peca_id = v_peca)
     where id = v_peca;
  end loop;

  update public.orcamentos
     set total = (select coalesce(sum(subtotal), 0) from public.orcamento_pecas where orcamento_id = v_id)
   where id = v_id;
  return v_id;
end $$;

-- Serviço com posição.
drop function public.salvar_servico(uuid, text, text, numeric, boolean, boolean);

create function public.salvar_servico(p_id uuid, p_nome text, p_detalhe text, p_valor numeric, p_a_partir_de boolean,
                                      p_ativo boolean, p_grupo text default 'outros')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform public.exigir_admin();
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do serviço'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor inválido'; end if;
  if coalesce(p_grupo, 'outros') not in ('frente', 'verso', 'outros') then raise exception 'Posição inválida'; end if;
  if v_id is null then
    insert into public.servicos (nome, detalhe, valor, a_partir_de, ativo, grupo, ordem)
    values (trim(p_nome), nullif(trim(p_detalhe), ''), p_valor, coalesce(p_a_partir_de, false), coalesce(p_ativo, true),
            coalesce(p_grupo, 'outros'),
            coalesce((select max(ordem) + 1 from public.servicos where grupo = coalesce(p_grupo, 'outros')), 1))
    returning id into v_id;
  else
    update public.servicos set nome = trim(p_nome), detalhe = nullif(trim(p_detalhe), ''), valor = p_valor,
           a_partir_de = coalesce(p_a_partir_de, false), ativo = coalesce(p_ativo, true), grupo = coalesce(p_grupo, grupo)
    where id = v_id;
    if not found then raise exception 'Serviço não encontrado'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.salvar_orcamento, public.salvar_servico from public, anon;
grant execute on function public.salvar_orcamento, public.salvar_servico to authenticated;

alter table public.orcamento_pecas enable row level security;
create policy leitura on public.orcamento_pecas for select to authenticated using (public.papel_atual() is not null);
