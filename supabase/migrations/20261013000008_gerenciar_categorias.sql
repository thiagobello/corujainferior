-- =====================================================================
-- Gerenciamento de categorias (Mais › Categorias): criar, renomear,
-- arquivar/reativar e excluir. Apenas administradores.
-- =====================================================================

alter table public.prefixos add column arquivada boolean not null default false;

-- Lista com contagem de produtos (para decidir entre excluir e arquivar).
create view public.categorias_resumo with (security_invoker = true) as
select
  pf.prefixo,
  pf.descricao,
  pf.arquivada,
  pf.proximo,
  pf.digitos,
  count(p.id)::int as produtos,
  count(p.id) filter (where p.status = 'Disponível' and not p.arquivado)::int as disponiveis
from public.prefixos pf
left join public.produtos p on p.prefixo = pf.prefixo
group by pf.prefixo;

-- Criar passa a ser só de administradores.
create or replace function public.criar_categoria(p_descricao text, p_prefixo text) returns public.prefixos
language plpgsql security definer set search_path = public as $$
declare
  v_desc text := trim(p_descricao);
  v_pref text := upper(trim(p_prefixo));
  r public.prefixos;
begin
  perform public.exigir_admin();
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

create function public.renomear_categoria(p_prefixo text, p_descricao text) returns void
language plpgsql security definer set search_path = public as $$
declare v_desc text := trim(p_descricao);
begin
  perform public.exigir_admin();
  if coalesce(v_desc, '') = '' then raise exception 'Informe o nome da categoria'; end if;
  if exists (select 1 from public.prefixos where lower(descricao) = lower(v_desc) and prefixo <> upper(p_prefixo)) then
    raise exception 'Já existe uma categoria chamada %', v_desc;
  end if;
  update public.prefixos set descricao = v_desc where prefixo = upper(p_prefixo);
  if not found then raise exception 'Categoria não encontrada'; end if;
end $$;

-- Arquivada: some do cadastro, mas os produtos e códigos continuam.
create function public.arquivar_categoria(p_prefixo text, p_arquivar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_admin();
  update public.prefixos set arquivada = coalesce(p_arquivar, true) where prefixo = upper(p_prefixo);
  if not found then raise exception 'Categoria não encontrada'; end if;
end $$;

-- Exclusão definitiva só de categoria que nunca teve produto (os códigos
-- da categoria nunca foram usados, então a sigla pode ser liberada).
create function public.excluir_categoria(p_prefixo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform public.exigir_admin();
  perform 1 from public.prefixos where prefixo = upper(p_prefixo) for update;
  if not found then raise exception 'Categoria não encontrada'; end if;
  select count(*) into v_n from public.produtos where prefixo = upper(p_prefixo);
  if v_n > 0 then
    raise exception 'A categoria tem % produto(s) e não pode ser excluída. Arquive-a para tirá-la do cadastro.', v_n;
  end if;
  delete from public.prefixos where prefixo = upper(p_prefixo);
end $$;

-- Cadastro não aceita categoria arquivada.
create function public.prefixos_guarda_produto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and exists (select 1 from public.prefixos where prefixo = new.prefixo and arquivada) then
    raise exception 'A categoria % está arquivada. Reative-a em Mais › Categorias para cadastrar.',
      (select descricao from public.prefixos where prefixo = new.prefixo);
  end if;
  return new;
end $$;

create trigger produtos_categoria_ativa before insert on public.produtos
  for each row execute function public.prefixos_guarda_produto();

revoke execute on function public.renomear_categoria, public.arquivar_categoria, public.excluir_categoria from public, anon;
grant execute on function public.renomear_categoria, public.arquivar_categoria, public.excluir_categoria to authenticated;
