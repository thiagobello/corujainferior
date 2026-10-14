-- =====================================================================
-- Listagem agrupada: produtos com a mesma descrição (vários tamanhos)
-- aparecem como um único item, com tamanhos e quantidades.
-- =====================================================================

-- Chave do grupo na listagem por unidade (para abrir o grupo).
create or replace view public.produtos_lista with (security_invoker = true) as
select
  p.*,
  (public.decompor_codigo(p.codigo)).numero as numero,
  pf.descricao as categoria,
  c.nome as consignante_nome,
  vi.venda_id,
  v.data_venda,
  v.forma as forma_venda,
  vi.valor_bruto as valor_vendido,
  vi.taxa_percentual as taxa_venda_percentual,
  vi.taxa_valor as taxa_venda_valor,
  r.id as reserva_id,
  r.tipo as reserva_tipo,
  r.cliente as reserva_cliente,
  r.previsao as reserva_previsao,
  lower(trim(p.descricao)) as grupo
from public.produtos p
join public.prefixos pf on pf.prefixo = p.prefixo
left join public.consignantes c on c.id = p.consignante_id
left join public.venda_itens vi on vi.produto_id = p.id and vi.ativo
left join public.vendas v on v.id = vi.venda_id
left join public.reservas r on r.produto_id = p.id and r.encerrada_em is null;

-- Ordem natural dos tamanhos.
create function public.ordem_tamanho(t text) returns integer
language sql immutable as $$
  select coalesce(array_position(
    array['PP','P','M','G','GG','2GG','3GG','4GG','9','12','16','18','20','22','24','26','28','Único'], t), 999)
$$;

-- Filtros valem para as unidades; o grupo mostra só as unidades filtradas.
create function public.listar_grupos(
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
    select p.*
    from public.produtos p
    where not p.arquivado
      and (coalesce(trim(p_busca), '') = ''
           or p.descricao ilike '%' || replace(replace(trim(p_busca), '%', '\%'), '_', '\_') || '%'
           or p.codigo like regexp_replace(upper(p_busca), '[^A-Z0-9]', '', 'g') || '%')
      and (p_status is null or p.status = p_status)
      and (p_prefixo is null or p.prefixo = p_prefixo)
      and (p_tamanho is null or p.tamanho = p_tamanho)
      and (p_tipo is null or p.tipo = p_tipo)
      and (p_condicao is null or p.condicao = p_condicao)
      and (p_pertence is null or p.pertence = p_pertence)
      and (p_site is null
           or (p_site = 'sim' and p.cadastrado_site is true)
           or (p_site = 'nao' and p.cadastrado_site is false)
           or (p_site = 'nv' and p.cadastrado_site is null))
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

revoke execute on function public.listar_grupos, public.ordem_tamanho from public, anon;
grant execute on function public.listar_grupos, public.ordem_tamanho to authenticated;
