-- =====================================================================
-- Autocomplete da descrição no cadastro: modelos já cadastrados com nome
-- parecido (ignora acentos, maiúsculas e ordem das palavras).
-- =====================================================================

create function public.sem_acento(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'))
$$;

-- Um resultado por modelo (descrição), com a unidade mais recente como
-- base para preencher o cadastro.
create function public.sugerir_modelos(p_busca text, p_limite integer default 6)
returns table (
  descricao text,
  unidades integer,
  disponiveis integer,
  tamanhos text[],
  produto_base uuid
)
language sql stable security invoker set search_path = public as $$
  with termos as (
    select replace(replace(t, '%', '\%'), '_', '\_') as t
    from regexp_split_to_table(public.sem_acento(trim(p_busca)), '\s+') t
    where t <> ''
  ),
  f as (
    select p.*
    from public.produtos p
    where not p.arquivado
      and exists (select 1 from termos)
      and not exists (select 1 from termos where public.sem_acento(p.descricao) not like '%' || termos.t || '%')
  )
  select
    (array_agg(f.descricao order by f.criado_em desc))[1] as descricao,
    count(*)::int as unidades,
    count(*) filter (where f.status = 'Disponível')::int as disponiveis,
    array_remove(array_agg(distinct f.tamanho), null) as tamanhos,
    (array_agg(f.id order by f.criado_em desc))[1] as produto_base
  from f
  group by lower(trim(f.descricao))
  order by
    -- Começa com o termo buscado primeiro, depois quem tem estoque.
    bool_or(public.sem_acento(f.descricao) like public.sem_acento(trim(p_busca)) || '%') desc,
    count(*) filter (where f.status = 'Disponível') desc,
    max(f.criado_em) desc
  limit least(greatest(coalesce(p_limite, 6), 1), 20)
$$;

revoke execute on function public.sugerir_modelos, public.sem_acento from public, anon;
grant execute on function public.sugerir_modelos, public.sem_acento to authenticated;
