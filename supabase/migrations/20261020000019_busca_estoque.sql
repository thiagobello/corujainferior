-- =====================================================================
-- Busca do estoque mais ampla (pedido do Thiago, 2026-10-20).
--
-- Ignora acentos e maiúsculas ("sao paulo" acha "São Paulo"), acha trechos
-- em qualquer posição ("corin" acha "Corinthians") e, com várias palavras,
-- exige todas em qualquer ordem ("2009 corinthians"). Procura em descrição,
-- código, cor, tamanho e categoria. O código também é achado pelo início
-- (M13 → M1386…) e escrito de outra forma (M01386 = M1386).
--
-- listar_unidades devolve as unidades filtradas (exportação) e é a base de
-- listar_grupos, para a lista e a exportação usarem sempre o mesmo filtro.
-- Usa sem_acento (migration 13) em vez da extensão unaccent, que não está
-- disponível no PGlite dos testes.
-- =====================================================================

-- Todas as palavras da busca aparecem no texto (sem acento, qualquer
-- posição), ou a busca inteira é o início do código.
create function public.casa_busca(p_texto text, p_codigo text, p_busca text) returns boolean
language sql immutable as $$
  select coalesce(trim(p_busca), '') = ''
      or coalesce(p_codigo like nullif(regexp_replace(upper(p_busca), '[^A-Z0-9]', '', 'g'), '') || '%', false)
      or not exists (
           select 1 from regexp_split_to_table(public.sem_acento(trim(p_busca)), '\s+') t
           where t <> '' and strpos(public.sem_acento(p_texto), t) = 0)
$$;

create function public.listar_unidades(
  p_busca text default null,
  p_status public.status_produto default null,
  p_prefixo text default null,
  p_tamanho text default null,
  p_tipo public.tipo_produto default null,
  p_condicao public.condicao_produto default null,
  p_pertence public.pertence_produto default null,
  p_site text default null
) returns setof public.produtos_lista
language sql stable security invoker set search_path = public as $$
  -- Só normaliza o que tem forma de código (número longo estouraria o integer).
  with b as (
    select nullif(trim(p_busca), '') as busca,
           case when regexp_replace(upper(coalesce(p_busca, '')), '[^A-Z0-9]', '', 'g') ~ '^[A-Z]{1,3}0*[0-9]{1,9}$'
                then public.normalizar_codigo(p_busca) end as codigo
  )
  select l.*
  from public.produtos_lista l, b
  where not l.arquivado
    and (b.busca is null
         or l.codigo = b.codigo
         or public.casa_busca(concat_ws(' ', l.descricao, l.codigo, l.cor, l.tamanho, l.categoria), l.codigo, b.busca))
    and (p_status is null or l.status = p_status)
    and (p_prefixo is null or l.prefixo = p_prefixo)
    and (p_tamanho is null or l.tamanho = p_tamanho)
    and (p_tipo is null or l.tipo = p_tipo)
    and (p_condicao is null or l.condicao = p_condicao)
    and (p_pertence is null or l.pertence = p_pertence)
    and (p_site is null
         or (p_site = 'sim' and l.cadastrado_site is true)
         or (p_site = 'nao' and l.cadastrado_site is false)
         or (p_site = 'nv' and l.cadastrado_site is null))
$$;

-- Mesma assinatura e mesmo retorno da migration 7; só o filtro mudou.
create or replace function public.listar_grupos(
  p_busca text default null,
  p_status public.status_produto default null,
  p_prefixo text default null,
  p_tamanho text default null,
  p_tipo public.tipo_produto default null,
  p_condicao public.condicao_produto default null,
  p_pertence public.pertence_produto default null,
  p_site text default null,
  p_limite integer default 50,
  p_offset integer default 0
) returns table (
  grupo text,
  descricao text,
  foto_path text,
  unidades integer,
  disponiveis integer,
  preco_min numeric,
  preco_max numeric,
  tamanhos jsonb,
  codigos text[],
  status_unico public.status_produto,
  produto_unico uuid,
  total bigint
)
language sql stable security invoker set search_path = public as $$
  with f as (
    select * from public.listar_unidades(p_busca, p_status, p_prefixo, p_tamanho, p_tipo, p_condicao, p_pertence, p_site)
  ),
  t as (
    select lower(trim(descricao)) as grupo, tamanho,
           count(*)::int as unidades,
           count(*) filter (where status = 'Disponível')::int as disponiveis
    from f group by 1, 2
  ),
  g as (
    select
      lower(trim(f.descricao)) as grupo,
      min(f.descricao) as descricao,
      (array_agg(f.foto_path order by (f.status = 'Disponível') desc, f.criado_em desc)
         filter (where f.foto_path is not null))[1] as foto_path,
      count(*)::int as unidades,
      count(*) filter (where f.status = 'Disponível')::int as disponiveis,
      coalesce(min(f.preco_venda) filter (where f.status = 'Disponível'), min(f.preco_venda)) as preco_min,
      coalesce(max(f.preco_venda) filter (where f.status = 'Disponível'), max(f.preco_venda)) as preco_max,
      array_agg(f.codigo order by f.prefixo, (public.decompor_codigo(f.codigo)).numero) as codigos,
      case when count(*) = 1 then min(f.status::text)::public.status_produto end as status_unico,
      case when count(*) = 1 then min(f.id::text)::uuid end as produto_unico
    from f group by 1
  )
  select
    g.grupo, g.descricao, g.foto_path, g.unidades, g.disponiveis, g.preco_min, g.preco_max,
    coalesce((select jsonb_agg(jsonb_build_object('tamanho', t.tamanho, 'unidades', t.unidades, 'disponiveis', t.disponiveis)
                               order by public.ordem_tamanho(t.tamanho), t.tamanho)
              from t where t.grupo = g.grupo), '[]'::jsonb) as tamanhos,
    g.codigos, g.status_unico, g.produto_unico,
    count(*) over () as total
  from g
  order by g.descricao
  limit least(greatest(p_limite, 1), 200) offset greatest(p_offset, 0)
$$;

revoke execute on function public.casa_busca, public.listar_unidades, public.listar_grupos from public, anon;
grant execute on function public.casa_busca, public.listar_unidades, public.listar_grupos to authenticated;
