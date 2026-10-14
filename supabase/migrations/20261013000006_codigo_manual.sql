-- =====================================================================
-- Código do produto informado no cadastro (com sugestão automática) e
-- remoção da importação por planilha.
-- =====================================================================

-- Um número só pode existir uma vez por categoria: M1386 e M01386 são o
-- mesmo código. Se já houver dados conflitantes, o índice não é criado e
-- a checagem continua sendo feita pelas funções abaixo.
do $$
begin
  create unique index produtos_prefixo_numero_idx
    on public.produtos (prefixo, ((public.decompor_codigo(codigo)).numero));
exception when unique_violation then
  raise notice 'Há números repetidos na mesma categoria; índice não criado';
end $$;

-- Forma canônica: sigla + número com zeros à esquerda até o mínimo de
-- dígitos da categoria (M5 → M005, M01386 → M1386).
create function public.normalizar_codigo(p_codigo text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  d record;
  v_dig integer;
begin
  select * into d from public.decompor_codigo(regexp_replace(upper(coalesce(p_codigo, '')), '[^A-Z0-9]', '', 'g'));
  if d.prefixo is null then return null; end if;
  select digitos into v_dig from public.prefixos where prefixo = d.prefixo;
  return d.prefixo || lpad(d.numero::text, greatest(coalesce(v_dig, 3), length(d.numero::text)), '0');
end $$;

-- Verifica se um código pode ser usado. Não reserva nada.
create function public.verificar_codigo(p_codigo text, p_prefixo text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_cod text := public.normalizar_codigo(p_codigo);
  d record;
  p record;
begin
  perform public.exigir_usuario();
  if v_cod is null then
    return jsonb_build_object('disponivel', false, 'motivo', 'Formato inválido: use a sigla seguida de números (ex.: M1386)');
  end if;
  select * into d from public.decompor_codigo(v_cod);
  if not exists (select 1 from public.prefixos where prefixo = d.prefixo) then
    return jsonb_build_object('disponivel', false, 'codigo', v_cod, 'motivo', 'Não existe categoria com a sigla ' || d.prefixo);
  end if;
  if p_prefixo is not null and d.prefixo <> upper(p_prefixo) then
    return jsonb_build_object('disponivel', false, 'codigo', v_cod,
      'motivo', 'O código deve começar com ' || upper(p_prefixo) || ', a sigla da categoria escolhida');
  end if;
  select codigo, descricao, tamanho into p from public.produtos
  where prefixo = d.prefixo and (public.decompor_codigo(codigo)).numero = d.numero
  limit 1;
  if found then
    return jsonb_build_object('disponivel', false, 'codigo', v_cod,
      'motivo', 'Já existe: ' || p.codigo || ' · ' || p.descricao || coalesce(' (' || p.tamanho || ')', ''));
  end if;
  return jsonb_build_object('disponivel', true, 'codigo', v_cod);
end $$;

-- Próximos códigos livres da categoria, sem consumir a sequência.
create function public.sugerir_codigos(p_prefixo text, p_quantidade integer default 1) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  pf public.prefixos;
  n integer;
  r text[] := '{}';
begin
  perform public.exigir_usuario();
  select * into pf from public.prefixos where prefixo = upper(p_prefixo);
  if not found then raise exception 'Categoria não encontrada'; end if;
  n := greatest(pf.proximo, coalesce((
    select max((public.decompor_codigo(codigo)).numero) + 1 from public.produtos where prefixo = pf.prefixo), 1));
  while coalesce(array_length(r, 1), 0) < least(greatest(coalesce(p_quantidade, 1), 1), 50) loop
    if not exists (select 1 from public.produtos where prefixo = pf.prefixo and (public.decompor_codigo(codigo)).numero = n) then
      r := r || (pf.prefixo || lpad(n::text, greatest(pf.digitos, length(n::text)), '0'));
    end if;
    n := n + 1;
  end loop;
  return r;
end $$;

-- Cadastro com códigos opcionais por tamanho (null = gerar automaticamente).
drop function public.criar_produtos(jsonb, text[]);

create function public.criar_produtos(p_dados jsonb, p_tamanhos text[], p_codigos text[] default null)
returns setof public.produtos
language plpgsql security definer set search_path = public as $$
declare
  v_prefixo text := upper(p_dados ->> 'prefixo');
  v_tamanhos text[] := coalesce(nullif(p_tamanhos, '{}'), array['Único']);
  v_codigo text;
  v_check jsonb;
  i integer;
begin
  perform public.exigir_usuario();
  if coalesce(trim(p_dados ->> 'descricao'), '') = '' then raise exception 'Informe a descrição'; end if;
  if p_dados ->> 'pertence' is null then raise exception 'Informe a quem o produto pertence'; end if;
  if p_dados ->> 'preco_venda' is null then raise exception 'Informe o preço de venda'; end if;
  if p_codigos is not null and coalesce(array_length(p_codigos, 1), 0) not in (0, array_length(v_tamanhos, 1)) then
    raise exception 'Informe um código para cada tamanho';
  end if;

  -- Trava a categoria: cadastros simultâneos na mesma categoria esperam a vez.
  perform 1 from public.prefixos where prefixo = v_prefixo for update;
  if not found then raise exception 'Categoria inválida: %', v_prefixo; end if;

  for i in 1 .. array_length(v_tamanhos, 1) loop
    v_codigo := nullif(trim(coalesce(p_codigos[i], '')), '');
    if v_codigo is null then
      v_codigo := public.gerar_codigo(v_prefixo);
    else
      v_check := public.verificar_codigo(v_codigo, v_prefixo);
      if not (v_check ->> 'disponivel')::boolean then
        raise exception 'Código %: %', upper(v_codigo), v_check ->> 'motivo';
      end if;
      v_codigo := v_check ->> 'codigo';
    end if;

    return query
    insert into public.produtos (codigo, prefixo, descricao, tamanho, cor, tipo, condicao, pertence,
                                 consignante_id, acordo_tipo, acordo_valor, custo, preco_venda,
                                 cadastrado_site, foto_path, observacoes)
    values (
      v_codigo, v_prefixo, trim(p_dados ->> 'descricao'), nullif(v_tamanhos[i], ''),
      nullif(trim(p_dados ->> 'cor'), ''),
      (p_dados ->> 'tipo')::public.tipo_produto,
      (p_dados ->> 'condicao')::public.condicao_produto,
      (p_dados ->> 'pertence')::public.pertence_produto,
      (p_dados ->> 'consignante_id')::uuid,
      nullif(p_dados ->> 'acordo_tipo', ''),
      (p_dados ->> 'acordo_valor')::numeric,
      (p_dados ->> 'custo')::numeric,
      (p_dados ->> 'preco_venda')::numeric,
      (p_dados ->> 'cadastrado_site')::boolean,
      nullif(p_dados ->> 'foto_path', ''),
      nullif(trim(p_dados ->> 'observacoes'), '')
    )
    returning *;

    -- A sugestão seguinte continua depois do maior código já usado.
    update public.prefixos set proximo = greatest(proximo, (public.decompor_codigo(v_codigo)).numero + 1)
    where prefixo = v_prefixo;
  end loop;
end $$;

-- Importação por planilha não é mais usada.
drop function if exists public.importar_produtos(jsonb, text);
drop table if exists public.importacoes;

revoke execute on function public.normalizar_codigo, public.verificar_codigo, public.sugerir_codigos,
  public.criar_produtos from public, anon;
grant execute on function public.normalizar_codigo, public.verificar_codigo, public.sugerir_codigos,
  public.criar_produtos to authenticated;
