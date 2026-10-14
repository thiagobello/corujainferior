-- =====================================================================
-- Categorias criadas pelo usuário e repasses semanais à Arquibancada
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorias (tabela prefixos): qualquer sigla de 1 a 3 letras
-- ---------------------------------------------------------------------
-- O prefixo é a parte de letras do código (AI012 → AI, 12); como o
-- código é sempre letras + números, não há ambiguidade entre siglas.
create or replace function public.decompor_codigo(p_codigo text, out prefixo text, out numero integer)
language sql immutable as $$
  select m[1], m[2]::integer
  from regexp_match(upper(trim(p_codigo)), '^([A-Z]{1,3})0*(\d+)$') as m
$$;

create unique index prefixos_descricao_idx on public.prefixos (lower(descricao));

create function public.criar_categoria(p_descricao text, p_prefixo text) returns public.prefixos
language plpgsql security definer set search_path = public as $$
declare
  v_desc text := trim(p_descricao);
  v_pref text := upper(trim(p_prefixo));
  r public.prefixos;
begin
  perform public.exigir_usuario();
  if coalesce(v_desc, '') = '' then raise exception 'Informe o nome da categoria'; end if;
  if v_pref !~ '^[A-Z]{1,3}$' then raise exception 'A sigla deve ter de 1 a 3 letras (sem acento)'; end if;
  if exists (select 1 from public.prefixos where prefixo = v_pref) then
    raise exception 'A sigla % já é usada pela categoria %', v_pref, (select descricao from public.prefixos where prefixo = v_pref);
  end if;
  if exists (select 1 from public.prefixos where lower(descricao) = lower(v_desc)) then
    raise exception 'Já existe uma categoria chamada %', v_desc;
  end if;
  insert into public.prefixos (prefixo, descricao) values (v_pref, v_desc) returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Repasses à Arquibancada Inferior (vendas de produtos "Ambos")
-- ---------------------------------------------------------------------
-- O dinheiro da venda entra na loja; a parte da Arquibancada (50% do
-- líquido) fica pendente até ser repassada. Se uma venda já repassada for
-- cancelada, o valor volta como estorno (negativo) no próximo repasse.
create table public.repasses (
  id uuid primary key default gen_random_uuid(),
  beneficiario text not null default 'arquibancada' check (beneficiario = 'arquibancada'),
  periodo_inicio date not null,
  periodo_fim date not null,
  valor numeric(12, 2) not null,
  pago_em date not null,
  observacoes text,
  status text not null default 'pago' check (status in ('pago', 'desfeito')),
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  desfeito_em timestamptz,
  desfeito_por uuid
);

alter table public.lancamentos
  add column repasse_id uuid references public.repasses (id),
  add column estorno_repasse_id uuid references public.repasses (id);

create view public.repasse_pendente with (security_invoker = true) as
select
  l.id as lancamento_id,
  l.venda_id,
  vi.produto_id,
  p.codigo,
  p.descricao,
  p.tamanho,
  vi.valor_bruto,
  vi.valor_liquido,
  case when l.ativo then 'venda' else 'estorno' end as tipo,
  case when l.ativo then v.data_venda else (v.cancelada_em at time zone 'America/Sao_Paulo')::date end as data_ref,
  case when l.ativo then l.valor else -l.valor end as valor
from public.lancamentos l
join public.venda_itens vi on vi.id = l.venda_item_id
join public.vendas v on v.id = l.venda_id
join public.produtos p on p.id = vi.produto_id
where l.beneficiario = 'arquibancada'
  and vi.pertence = 'Ambos'
  and (
    (l.ativo and v.status = 'concluida' and l.repasse_id is null)
    or (not l.ativo and l.repasse_id is not null and l.estorno_repasse_id is null)
  );

create function public.registrar_repasse(p_inicio date, p_fim date, p_pago_em date default null, p_observacoes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_total numeric(12, 2);
  v_qtd integer;
begin
  perform public.exigir_admin();
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período inválido'; end if;

  -- Trava os lançamentos do período para dois repasses simultâneos não
  -- pegarem o mesmo valor.
  perform 1 from public.lancamentos l
  where l.id in (select lancamento_id from public.repasse_pendente where data_ref between p_inicio and p_fim)
  for update;

  select count(*), coalesce(sum(valor), 0) into v_qtd, v_total
  from public.repasse_pendente where data_ref between p_inicio and p_fim;
  if v_qtd = 0 then raise exception 'Não há valores pendentes de repasse nesse período'; end if;

  insert into public.repasses (periodo_inicio, periodo_fim, valor, pago_em, observacoes)
  values (p_inicio, p_fim, v_total, coalesce(p_pago_em, (now() at time zone 'America/Sao_Paulo')::date),
          nullif(trim(p_observacoes), ''))
  returning id into v_id;

  update public.lancamentos set repasse_id = v_id
  where id in (select lancamento_id from public.repasse_pendente where tipo = 'venda' and data_ref between p_inicio and p_fim);
  update public.lancamentos set estorno_repasse_id = v_id
  where id in (select lancamento_id from public.repasse_pendente where tipo = 'estorno' and data_ref between p_inicio and p_fim);
  return v_id;
end $$;

create function public.desfazer_repasse(p_repasse uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.repasses;
begin
  perform public.exigir_admin();
  select * into r from public.repasses where id = p_repasse for update;
  if not found then raise exception 'Repasse não encontrado'; end if;
  if r.status = 'desfeito' then return; end if;
  -- Um valor deste repasse já foi estornado em outro repasse: desfazer só
  -- este deixaria o estorno sem o pagamento correspondente.
  if exists (select 1 from public.lancamentos where repasse_id = p_repasse and estorno_repasse_id is not null) then
    raise exception 'Há estornos deste repasse lançados em um repasse posterior. Desfaça aquele repasse primeiro.';
  end if;
  update public.lancamentos set repasse_id = null where repasse_id = p_repasse;
  update public.lancamentos set estorno_repasse_id = null where estorno_repasse_id = p_repasse;
  update public.repasses set status = 'desfeito', desfeito_em = now(), desfeito_por = auth.uid() where id = p_repasse;
end $$;

revoke execute on function public.criar_categoria, public.registrar_repasse, public.desfazer_repasse from public, anon;
grant execute on function public.criar_categoria, public.registrar_repasse, public.desfazer_repasse to authenticated;

alter table public.repasses enable row level security;
create policy leitura on public.repasses for select to authenticated using (public.papel_atual() is not null);
