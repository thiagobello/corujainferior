-- =====================================================================
-- Funções de negócio (todas atômicas: cada chamada é uma transação)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Divisão do valor líquido de um item entre marcas / proprietário
-- ---------------------------------------------------------------------
create function public._lancar_marca(p_venda uuid, p_item uuid, p_marca text, p_valor numeric, p_desc text)
returns void language plpgsql security definer set search_path = public as $$
declare v_arq numeric(12, 2);
begin
  if p_marca = 'ambos' then
    -- Metade para cada; o centavo residual fica com a Coruja, de modo que
    -- coruja + arquibancada = valor exato.
    v_arq := trunc(p_valor / 2, 2);
    insert into public.lancamentos (venda_id, venda_item_id, beneficiario, valor, descricao) values
      (p_venda, p_item, 'coruja', p_valor - v_arq, p_desc || ' (50%)'),
      (p_venda, p_item, 'arquibancada', v_arq, p_desc || ' (50%)');
  else
    insert into public.lancamentos (venda_id, venda_item_id, beneficiario, valor, descricao)
    values (p_venda, p_item, p_marca, p_valor, p_desc);
  end if;
end $$;

create function public._dividir_item(
  p_venda uuid, p_item uuid, p_liquido numeric, p_pertence public.pertence_produto,
  p_consignante uuid, p_acordo_tipo text, p_acordo_valor numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  c public.consignantes;
  v_tipo text;
  v_valor numeric;
  v_devido numeric(12, 2);
begin
  case p_pertence
    when 'Coruja Sports' then
      perform public._lancar_marca(p_venda, p_item, 'coruja', p_liquido, 'Coruja Sports 100%');
    when 'Arquibancada Inferior' then
      perform public._lancar_marca(p_venda, p_item, 'arquibancada', p_liquido, 'Arquibancada Inferior 100%');
    when 'Ambos' then
      perform public._lancar_marca(p_venda, p_item, 'ambos', p_liquido, 'Ambos');
    when 'Concessão' then
      if p_consignante is null then
        -- Só acontece em vendas importadas: sem acordo conhecido, não presume
        -- que a loja fica com nada; todo o líquido fica devido ao proprietário.
        insert into public.lancamentos (venda_id, venda_item_id, beneficiario, valor, descricao)
        values (p_venda, p_item, 'consignante', p_liquido, 'Concessão sem proprietário definido');
        return;
      end if;
      select * into c from public.consignantes where id = p_consignante;
      v_tipo := coalesce(p_acordo_tipo, c.tipo_acordo);
      v_valor := coalesce(p_acordo_valor, c.valor_acordo);
      v_devido := case when v_tipo = 'percentual' then round(p_liquido * v_valor / 100, 2) else v_valor end;
      insert into public.lancamentos (venda_id, venda_item_id, beneficiario, consignante_id, valor, descricao)
      values (p_venda, p_item, 'consignante', p_consignante, v_devido,
              'Devido a ' || c.nome || case when v_tipo = 'percentual' then ' (' || v_valor || '% do líquido)' else ' (valor fixo)' end);
      if p_liquido - v_devido <> 0 then
        perform public._lancar_marca(p_venda, p_item, c.marca_restante, p_liquido - v_devido, 'Comissão da concessão');
      end if;
  end case;
end $$;

-- ---------------------------------------------------------------------
-- Núcleo da venda (interno). Idempotente pela chave.
-- ---------------------------------------------------------------------
create function public._inserir_venda(
  p_chave uuid,
  p_itens jsonb,                     -- [{produto_id, valor_bruto}]
  p_forma public.forma_pagamento,
  p_data date,
  p_cliente text,
  p_observacoes text,
  p_pagamento_pendente boolean,
  p_origem text,
  p_importacao boolean default false,
  p_forma_original text default null,
  p_taxa_percentual numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_venda uuid;
  v_taxa public.taxas;
  v_pct numeric(7, 4);
  v_data date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  it record;
  prod public.produtos;
  v_item uuid;
  v_taxa_item numeric(12, 2);
  v_bruto numeric(12, 2) := 0;
  v_taxa_total numeric(12, 2) := 0;
  v_n integer;
  k integer;
  v_pb numeric(12, 2);
  v_pt numeric(12, 2);
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa ter ao menos um produto';
  end if;

  select * into v_taxa from public.taxas where forma = p_forma;
  v_pct := coalesce(p_taxa_percentual, v_taxa.percentual);

  insert into public.vendas (idempotency_key, data_venda, forma, forma_original, taxa_percentual,
                             cliente, observacoes, origem)
  values (p_chave, v_data, p_forma, p_forma_original, v_pct,
          nullif(trim(p_cliente), ''), nullif(trim(p_observacoes), ''), p_origem)
  on conflict (idempotency_key) do nothing
  returning id into v_venda;

  if v_venda is null then
    -- Mesma chave já processada (clique duplo / reenvio após falha de rede).
    select id into v_venda from public.vendas where idempotency_key = p_chave;
    return v_venda;
  end if;

  perform set_config('app.operacao', 'venda', true);

  -- Ordem estável de travas evita deadlock entre vendas simultâneas.
  for it in
    select (x ->> 'produto_id')::uuid as produto_id, (x ->> 'valor_bruto')::numeric as valor_bruto
    from jsonb_array_elements(p_itens) x
    order by 1
  loop
    select * into prod from public.produtos where id = it.produto_id for update;
    if not found then raise exception 'Produto não encontrado'; end if;

    if not p_importacao then
      if prod.arquivado then raise exception 'O produto % está arquivado', prod.codigo; end if;
      if prod.status <> 'Disponível' then
        raise exception 'O produto % não pode ser vendido: status %', prod.codigo, prod.status
          using errcode = 'P0001', hint = 'status_indisponivel';
      end if;
      if prod.pertence = 'Concessão' and prod.consignante_id is null then
        raise exception 'Defina o proprietário da concessão do produto % antes de vender', prod.codigo;
      end if;
    end if;

    if it.valor_bruto is null or it.valor_bruto < 0 or it.valor_bruto <> round(it.valor_bruto, 2) then
      raise exception 'Valor de venda inválido para %', prod.codigo;
    end if;

    v_taxa_item := round(it.valor_bruto * v_pct / 100, 2);

    insert into public.venda_itens (venda_id, produto_id, preco_padrao, custo, pertence, consignante_id,
                                    valor_bruto, taxa_percentual, taxa_valor, valor_liquido, lucro_bruto, resultado)
    values (v_venda, prod.id, prod.preco_venda, prod.custo, prod.pertence, prod.consignante_id,
            it.valor_bruto, v_pct, v_taxa_item, it.valor_bruto - v_taxa_item,
            it.valor_bruto - coalesce(prod.custo, 0),
            it.valor_bruto - coalesce(prod.custo, 0) - v_taxa_item)
    returning id into v_item;

    perform public._dividir_item(v_venda, v_item, it.valor_bruto - v_taxa_item, prod.pertence,
                                 prod.consignante_id, prod.acordo_tipo, prod.acordo_valor);

    if not p_importacao then
      update public.produtos set status = 'Vendida' where id = prod.id;
      insert into public.movimentacoes (produto_id, tipo, status_anterior, status_novo, detalhes, observacoes)
      values (prod.id, 'venda', prod.status, 'Vendida',
              jsonb_build_object('venda_id', v_venda, 'valor_bruto', it.valor_bruto, 'forma', p_forma,
                                 'taxa_percentual', v_pct, 'taxa_valor', v_taxa_item,
                                 'desconto', prod.preco_venda - it.valor_bruto, 'origem', p_origem),
              nullif(trim(p_cliente), ''));
      if prod.cadastrado_site is true then
        insert into public.alertas_site (produto_id, venda_id) values (prod.id, v_venda)
        on conflict (produto_id) where status in ('pendente', 'adiado') do nothing;
      end if;
    end if;

    v_bruto := v_bruto + it.valor_bruto;
    v_taxa_total := v_taxa_total + v_taxa_item;
  end loop;

  update public.vendas set valor_bruto = v_bruto, taxa_valor = v_taxa_total,
                           valor_liquido = v_bruto - v_taxa_total
  where id = v_venda;

  -- Recebimentos: uma linha por parcela; residual de centavos na 1ª parcela.
  v_n := coalesce(v_taxa.parcelas, 1);
  for k in 1 .. v_n loop
    v_pb := trunc(v_bruto / v_n, 2);
    v_pt := trunc(v_taxa_total / v_n, 2);
    if k = 1 then
      v_pb := v_bruto - v_pb * (v_n - 1);
      v_pt := v_taxa_total - v_pt * (v_n - 1);
    end if;
    insert into public.pagamentos (venda_id, parcela, total_parcelas, valor_bruto, taxa_valor, valor_liquido,
                                   vencimento, liquidacao, status, recebido_em)
    values (
      v_venda, k, v_n, v_pb, v_pt, v_pb - v_pt,
      case when v_taxa.liquidacao = 'mensal' then (v_data + make_interval(months => k))::date else v_data end,
      case when not p_pagamento_pendente and v_taxa.liquidacao = 'mensal' and not p_importacao
           then 'automatica' else 'manual' end,
      case when p_importacao or (not p_pagamento_pendente and v_taxa.liquidacao = 'imediata')
           then 'recebido' else 'pendente' end,
      case when p_importacao or (not p_pagamento_pendente and v_taxa.liquidacao = 'imediata')
           then v_data end
    );
  end loop;

  perform set_config('app.operacao', '', true);
  return v_venda;
end $$;

-- ---------------------------------------------------------------------
-- Venda (tela de vendas e baixa rápida usam a mesma função)
-- ---------------------------------------------------------------------
create function public.registrar_venda(
  p_chave uuid,
  p_itens jsonb,
  p_forma public.forma_pagamento,
  p_data date default null,
  p_cliente text default null,
  p_observacoes text default null,
  p_pagamento_pendente boolean default false,
  p_origem text default 'venda'
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_usuario();
  if p_forma = 'outro' then raise exception 'Escolha uma forma de pagamento válida'; end if;
  if p_origem not in ('venda', 'baixa_rapida') then raise exception 'Origem inválida'; end if;
  if p_chave is null then raise exception 'Chave da venda ausente'; end if;
  return public._inserir_venda(p_chave, p_itens, p_forma, p_data, p_cliente, p_observacoes,
                               coalesce(p_pagamento_pendente, false), p_origem);
end $$;

create function public.cancelar_venda(p_venda uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.vendas;
  it record;
begin
  perform public.exigir_admin();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into v from public.vendas where id = p_venda for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v.status = 'cancelada' then return; end if;

  perform set_config('app.operacao', 'cancelamento_venda', true);
  for it in select vi.*, p.status as status_produto from public.venda_itens vi
            join public.produtos p on p.id = vi.produto_id
            where vi.venda_id = p_venda and vi.ativo
            order by vi.produto_id for update of p loop
    update public.produtos set status = 'Disponível' where id = it.produto_id and status = 'Vendida';
    insert into public.movimentacoes (produto_id, tipo, status_anterior, status_novo, detalhes, observacoes)
    values (it.produto_id, 'cancelamento_venda', it.status_produto, 'Disponível',
            jsonb_build_object('venda_id', p_venda), p_motivo);
  end loop;
  perform set_config('app.operacao', '', true);

  update public.venda_itens set ativo = false where venda_id = p_venda;
  update public.lancamentos set ativo = false where venda_id = p_venda;
  update public.pagamentos set status = 'cancelado' where venda_id = p_venda;
  update public.alertas_site set status = 'cancelado', resolvido_em = now(), resolvido_por = auth.uid()
    where venda_id = p_venda and status in ('pendente', 'adiado');
  update public.vendas set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(),
                           motivo_cancelamento = p_motivo
    where id = p_venda;
end $$;

create function public.marcar_pagamento(p_pagamento uuid, p_recebido boolean, p_data date default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_usuario();
  update public.pagamentos
     set status = case when p_recebido then 'recebido' else 'pendente' end,
         recebido_em = case when p_recebido then coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date) end,
         liquidacao = case when p_recebido then liquidacao else 'manual' end
   where id = p_pagamento and status <> 'cancelado';
  if not found then raise exception 'Pagamento não encontrado ou cancelado'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Cadastro (individual e em lote: um produto por tamanho)
-- ---------------------------------------------------------------------
create function public.criar_produtos(p_dados jsonb, p_tamanhos text[]) returns setof public.produtos
language plpgsql security definer set search_path = public as $$
declare
  t text;
  v_prefixo text := upper(p_dados ->> 'prefixo');
  v_tamanhos text[] := coalesce(nullif(p_tamanhos, '{}'), array['Único']);
begin
  perform public.exigir_usuario();
  if coalesce(trim(p_dados ->> 'descricao'), '') = '' then raise exception 'Informe a descrição'; end if;
  if p_dados ->> 'pertence' is null then raise exception 'Informe a quem o produto pertence'; end if;
  if p_dados ->> 'preco_venda' is null then raise exception 'Informe o preço de venda'; end if;
  foreach t in array v_tamanhos loop
    return query
    insert into public.produtos (codigo, prefixo, descricao, tamanho, cor, tipo, condicao, pertence,
                                 consignante_id, acordo_tipo, acordo_valor, custo, preco_venda,
                                 cadastrado_site, foto_path, observacoes)
    values (
      public.gerar_codigo(v_prefixo), v_prefixo, trim(p_dados ->> 'descricao'), nullif(t, ''),
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
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Reservas e empréstimos
-- ---------------------------------------------------------------------
create function public.reservar_produto(
  p_produto uuid, p_tipo text, p_cliente text default null,
  p_observacoes text default null, p_previsao date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  prod public.produtos;
  v_id uuid;
  v_status public.status_produto;
begin
  perform public.exigir_usuario();
  if p_tipo not in ('reserva', 'emprestimo') then raise exception 'Tipo inválido'; end if;
  select * into prod from public.produtos where id = p_produto for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if prod.status <> 'Disponível' then
    raise exception 'O produto % não está disponível (status %)', prod.codigo, prod.status;
  end if;
  v_status := case when p_tipo = 'reserva' then 'Reservada' else 'Emprestada' end;

  insert into public.reservas (produto_id, tipo, cliente, observacoes, previsao)
  values (p_produto, p_tipo, nullif(trim(p_cliente), ''), nullif(trim(p_observacoes), ''), p_previsao)
  returning id into v_id;

  perform set_config('app.operacao', p_tipo, true);
  update public.produtos set status = v_status where id = p_produto;
  perform set_config('app.operacao', '', true);

  insert into public.movimentacoes (produto_id, tipo, status_anterior, status_novo, detalhes, observacoes)
  values (p_produto, p_tipo, 'Disponível', v_status,
          jsonb_build_object('reserva_id', v_id, 'cliente', p_cliente, 'previsao', p_previsao), p_observacoes);
  return v_id;
end $$;

create function public.encerrar_reserva(p_reserva uuid, p_observacoes text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.reservas;
  prod public.produtos;
  v_esperado public.status_produto;
begin
  perform public.exigir_usuario();
  select * into r from public.reservas where id = p_reserva for update;
  if not found then raise exception 'Reserva não encontrada'; end if;
  if r.encerrada_em is not null then raise exception 'Esta reserva já foi encerrada'; end if;
  select * into prod from public.produtos where id = r.produto_id for update;

  update public.reservas set encerrada_em = now(), encerrada_por = auth.uid(),
                             obs_encerramento = nullif(trim(p_observacoes), '')
  where id = p_reserva;

  v_esperado := case when r.tipo = 'reserva' then 'Reservada' else 'Emprestada' end;
  -- Só devolve para Disponível se nenhuma outra movimentação válida mudou o status.
  if prod.status = v_esperado
     and not exists (select 1 from public.venda_itens where produto_id = prod.id and ativo) then
    perform set_config('app.operacao', 'encerrar_reserva', true);
    update public.produtos set status = 'Disponível' where id = prod.id;
    perform set_config('app.operacao', '', true);
  end if;

  insert into public.movimentacoes (produto_id, tipo, status_anterior, status_novo, detalhes, observacoes)
  values (prod.id, case when r.tipo = 'reserva' then 'cancelamento_reserva' else 'devolucao' end,
          prod.status, (select status from public.produtos where id = prod.id),
          jsonb_build_object('reserva_id', r.id), p_observacoes);
end $$;

-- ---------------------------------------------------------------------
-- Alertas do site
-- ---------------------------------------------------------------------
create function public.resolver_alerta_site(p_alerta uuid, p_acao text, p_adiar_horas integer default 24)
returns void language plpgsql security definer set search_path = public as $$
declare a public.alertas_site;
begin
  perform public.exigir_usuario();
  select * into a from public.alertas_site where id = p_alerta for update;
  if not found then raise exception 'Alerta não encontrado'; end if;
  if a.status not in ('pendente', 'adiado') then return; end if; -- já concluído: não repete

  if p_acao = 'removido' then
    update public.alertas_site set status = 'removido', resolvido_em = now(), resolvido_por = auth.uid(),
                                   adiado_ate = null where id = p_alerta;
    update public.produtos set cadastrado_site = false where id = a.produto_id;
    insert into public.movimentacoes (produto_id, tipo, observacoes) values (a.produto_id, 'site_removido', 'Removido do site');
  elsif p_acao = 'adiar' then
    update public.alertas_site set status = 'adiado',
           adiado_ate = now() + make_interval(hours => greatest(coalesce(p_adiar_horas, 24), 1))
    where id = p_alerta;
    insert into public.movimentacoes (produto_id, tipo, detalhes)
    values (a.produto_id, 'site_adiado', jsonb_build_object('horas', p_adiar_horas));
  elsif p_acao = 'pendente' then
    update public.alertas_site set status = 'pendente', adiado_ate = null where id = p_alerta;
  else
    raise exception 'Ação inválida';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Configurações
-- ---------------------------------------------------------------------
create function public.atualizar_taxa(p_forma public.forma_pagamento, p_percentual numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_ant numeric;
begin
  perform public.exigir_admin();
  if p_percentual is null or p_percentual < 0 or p_percentual >= 100 then
    raise exception 'Percentual inválido';
  end if;
  select percentual into v_ant from public.taxas where forma = p_forma for update;
  update public.taxas set percentual = p_percentual, atualizado_em = now(), atualizado_por = auth.uid()
   where forma = p_forma;
  insert into public.taxas_historico (forma, percentual_anterior, percentual_novo)
  values (p_forma, v_ant, p_percentual);
end $$;

create function public.definir_usuario(p_usuario uuid, p_papel public.papel_usuario, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_admin();
  if p_usuario = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode remover seu próprio acesso de administrador';
  end if;
  update public.perfis set papel = p_papel, ativo = p_ativo where id = p_usuario;
end $$;

-- ---------------------------------------------------------------------
-- Importação da planilha (idempotente por import_chave)
-- ---------------------------------------------------------------------
create function public.importar_produtos(p_registros jsonb, p_arquivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_id uuid;
  v_codigo text;
  v_inseridos integer := 0;
  v_ignorados integer := 0;
  v_vendas integer := 0;
  v_erros jsonb := '[]'::jsonb;
  v_status public.status_produto;
begin
  perform public.exigir_admin();
  for r in select * from jsonb_array_elements(p_registros) loop
    begin
      v_codigo := upper(trim(coalesce(r ->> 'codigo', '')));
      if v_codigo = '' then
        -- Sem código válido na planilha (ou código repetido): gera um novo.
        -- Se a chave já foi importada antes, não gasta um número à toa.
        if exists (select 1 from public.produtos where import_chave = r ->> 'import_chave') then
          v_ignorados := v_ignorados + 1;
          continue;
        end if;
        v_codigo := public.gerar_codigo(r ->> 'prefixo');
      end if;
      v_status := coalesce((r ->> 'status')::public.status_produto, 'Disponível');
      perform set_config('app.operacao', 'importacao', true);
      insert into public.produtos (codigo, prefixo, descricao, tamanho, cor, tipo, condicao, pertence,
                                   custo, preco_venda, status, cadastrado_site, observacoes,
                                   codigo_original, dados_origem, import_chave)
      values (
        v_codigo, (public.decompor_codigo(v_codigo)).prefixo, trim(r ->> 'descricao'),
        nullif(r ->> 'tamanho', ''), nullif(r ->> 'cor', ''),
        (r ->> 'tipo')::public.tipo_produto, (r ->> 'condicao')::public.condicao_produto,
        (r ->> 'pertence')::public.pertence_produto,
        (r ->> 'custo')::numeric, coalesce((r ->> 'preco_venda')::numeric, 0), v_status,
        (r ->> 'cadastrado_site')::boolean, nullif(r ->> 'observacoes', ''),
        nullif(r ->> 'codigo_original', ''), r -> 'dados_origem', r ->> 'import_chave'
      )
      on conflict (import_chave) do nothing
      returning id into v_id;

      if v_id is null then
        v_ignorados := v_ignorados + 1;
      else
        v_inseridos := v_inseridos + 1;
        if v_status = 'Vendida' and r -> 'venda' is not null and r -> 'venda' ->> 'data' is not null then
          perform public._inserir_venda(
            md5('importacao:' || (r ->> 'import_chave'))::uuid,
            jsonb_build_array(jsonb_build_object('produto_id', v_id, 'valor_bruto', coalesce((r -> 'venda' ->> 'valor')::numeric, (r ->> 'preco_venda')::numeric, 0))),
            coalesce((r -> 'venda' ->> 'forma')::public.forma_pagamento, 'outro'),
            (r -> 'venda' ->> 'data')::date, null, r -> 'venda' ->> 'observacoes', false, 'importacao',
            true, r -> 'venda' ->> 'forma_original', (r -> 'venda' ->> 'taxa_percentual')::numeric
          );
          v_vendas := v_vendas + 1;
        end if;
        if v_status in ('Reservada', 'Emprestada') then
          insert into public.reservas (produto_id, tipo, observacoes)
          values (v_id, case when v_status = 'Reservada' then 'reserva' else 'emprestimo' end, 'Importado da planilha');
        end if;
        if v_status = 'Vendida' and (r ->> 'cadastrado_site')::boolean is true then
          insert into public.alertas_site (produto_id) values (v_id)
          on conflict (produto_id) where status in ('pendente', 'adiado') do nothing;
        end if;
      end if;
      perform set_config('app.operacao', '', true);
    exception when others then
      perform set_config('app.operacao', '', true);
      v_erros := v_erros || jsonb_build_object('import_chave', r ->> 'import_chave', 'codigo', v_codigo, 'erro', sqlerrm);
    end;
  end loop;

  -- Contadores sempre acima do maior código existente: nunca reutiliza.
  update public.prefixos pf set proximo = greatest(pf.proximo, m.maximo + 1)
  from (select (public.decompor_codigo(codigo)).prefixo as prefixo, max((public.decompor_codigo(codigo)).numero) as maximo
        from public.produtos group by 1) m
  where m.prefixo = pf.prefixo;

  insert into public.importacoes (arquivo, resumo)
  values (p_arquivo, jsonb_build_object('inseridos', v_inseridos, 'ignorados', v_ignorados,
                                        'vendas', v_vendas, 'erros', jsonb_array_length(v_erros)));

  return jsonb_build_object('inseridos', v_inseridos, 'ignorados', v_ignorados, 'vendas', v_vendas, 'erros', v_erros);
end $$;

-- ---------------------------------------------------------------------
-- Consultas
-- ---------------------------------------------------------------------
create view public.produtos_lista with (security_invoker = true) as
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
  r.previsao as reserva_previsao
from public.produtos p
join public.prefixos pf on pf.prefixo = p.prefixo
left join public.consignantes c on c.id = p.consignante_id
left join public.venda_itens vi on vi.produto_id = p.id and vi.ativo
left join public.vendas v on v.id = vi.venda_id
left join public.reservas r on r.produto_id = p.id and r.encerrada_em is null;

-- Pagamento conta como recebido quando marcado, ou quando é parcela de
-- cartão (liquidação automática) e a data de vencimento já passou.
create view public.pagamentos_situacao with (security_invoker = true) as
select
  pg.*,
  v.data_venda, v.cliente, v.forma, v.status as status_venda,
  (pg.status = 'recebido'
   or (pg.status = 'pendente' and pg.liquidacao = 'automatica'
       and pg.vencimento <= (now() at time zone 'America/Sao_Paulo')::date)) as recebido,
  case when pg.status = 'recebido' then pg.recebido_em else pg.vencimento end as data_recebimento
from public.pagamentos pg
join public.vendas v on v.id = pg.venda_id
where pg.status <> 'cancelado' and v.status = 'concluida';

create function public.resumo_estoque() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'disponiveis', count(*) filter (where status = 'Disponível'),
    'vendidos', count(*) filter (where status = 'Vendida'),
    'reservados', count(*) filter (where status = 'Reservada'),
    'emprestados', count(*) filter (where status = 'Emprestada'),
    'custo_disponivel', coalesce(sum(custo) filter (where status = 'Disponível'), 0),
    'valor_potencial', coalesce(sum(preco_venda) filter (where status = 'Disponível'), 0),
    'sem_custo', count(*) filter (where status = 'Disponível' and custo is null)
  )
  from public.produtos where not arquivado
$$;

create function public.resumo_financeiro(p_inicio date, p_fim date, p_marca text default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with itens as (
    select vi.*, v.forma, v.data_venda, p.descricao
    from public.venda_itens vi
    join public.vendas v on v.id = vi.venda_id
    join public.produtos p on p.id = vi.produto_id
    where vi.ativo and v.status = 'concluida'
      and v.data_venda between p_inicio and p_fim
      and (p_marca is null or exists (
        select 1 from public.lancamentos l
        where l.venda_item_id = vi.id and l.ativo and l.beneficiario = p_marca))
  ),
  lanc as (
    select l.beneficiario, sum(l.valor) as valor
    from public.lancamentos l join itens i on i.id = l.venda_item_id
    where l.ativo group by 1
  ),
  pag as (
    select * from public.pagamentos_situacao
  )
  select jsonb_build_object(
    'vendas', (select count(distinct venda_id) from itens),
    'itens', (select count(*) from itens),
    'bruto', (select coalesce(sum(valor_bruto), 0) from itens),
    'descontos', (select coalesce(sum(desconto), 0) from itens),
    'taxas', (select coalesce(sum(taxa_valor), 0) from itens),
    'liquido', (select coalesce(sum(valor_liquido), 0) from itens),
    'custos', (select coalesce(sum(custo), 0) from itens),
    'itens_sem_custo', (select count(*) from itens where custo is null),
    'lucro_bruto', (select coalesce(sum(lucro_bruto), 0) from itens),
    'resultado', (select coalesce(sum(resultado), 0) from itens),
    'marcas', jsonb_build_object(
      'coruja', coalesce((select valor from lanc where beneficiario = 'coruja'), 0),
      'arquibancada', coalesce((select valor from lanc where beneficiario = 'arquibancada'), 0),
      'consignantes', coalesce((select valor from lanc where beneficiario = 'consignante'), 0)
    ),
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object('forma', forma, 'vendas', n, 'bruto', bruto, 'liquido', liq) order by bruto desc)
      from (select forma, count(distinct venda_id) n, sum(valor_bruto) bruto, sum(valor_liquido) liq
            from itens group by forma) f), '[]'::jsonb),
    'mais_vendidos', coalesce((
      select jsonb_agg(jsonb_build_object('descricao', descricao, 'quantidade', n, 'bruto', bruto) order by n desc, bruto desc)
      from (select descricao, count(*) n, sum(valor_bruto) bruto from itens
            group by descricao order by count(*) desc, sum(valor_bruto) desc limit 10) t), '[]'::jsonb),
    -- Recebimentos são da loja inteira (uma venda pode misturar marcas).
    'recebido_periodo', (select coalesce(sum(valor_liquido), 0) from pag
                         where recebido and data_recebimento between p_inicio and p_fim),
    'a_receber', (select coalesce(sum(valor_liquido), 0) from pag where not recebido),
    'pagamentos_pendentes', (select count(*) from pag where not recebido and liquidacao = 'manual'),
    'valor_pendente_manual', (select coalesce(sum(valor_liquido), 0) from pag where not recebido and liquidacao = 'manual'),
    'reservas_ativas', (select count(*) from public.reservas where encerrada_em is null and tipo = 'reserva'),
    'emprestimos_ativos', (select count(*) from public.reservas where encerrada_em is null and tipo = 'emprestimo'),
    'alertas_site', (select count(*) from public.alertas_site where status in ('pendente', 'adiado'))
  )
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on function public._lancar_marca, public._dividir_item, public._inserir_venda,
  public.gerar_codigo, public.on_auth_user_created from authenticated;
grant execute on function public.registrar_venda, public.cancelar_venda, public.marcar_pagamento,
  public.criar_produtos, public.reservar_produto, public.encerrar_reserva, public.resolver_alerta_site,
  public.atualizar_taxa, public.definir_usuario, public.importar_produtos, public.resumo_estoque,
  public.resumo_financeiro, public.papel_atual, public.exigir_usuario, public.exigir_admin,
  public.decompor_codigo to authenticated;

alter table public.perfis enable row level security;
alter table public.prefixos enable row level security;
alter table public.consignantes enable row level security;
alter table public.produtos enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.reservas enable row level security;
alter table public.taxas enable row level security;
alter table public.taxas_historico enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.pagamentos enable row level security;
alter table public.lancamentos enable row level security;
alter table public.alertas_site enable row level security;
alter table public.importacoes enable row level security;

-- Leitura: qualquer usuário ativo. Escrita: só pelas funções acima,
-- exceto edição de produtos/consignantes (protegida pelo gatilho de guarda).
create policy leitura on public.perfis for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.prefixos for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.consignantes for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.produtos for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.movimentacoes for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.reservas for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.taxas for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.taxas_historico for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.vendas for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.venda_itens for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.pagamentos for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.lancamentos for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.alertas_site for select to authenticated using (public.papel_atual() is not null);
create policy leitura on public.importacoes for select to authenticated using (public.papel_atual() = 'admin');

create policy edicao on public.produtos for update to authenticated
  using (public.papel_atual() is not null) with check (public.papel_atual() is not null);
create policy cadastro on public.consignantes for insert to authenticated with check (public.papel_atual() is not null);
create policy edicao on public.consignantes for update to authenticated
  using (public.papel_atual() is not null) with check (public.papel_atual() is not null);

-- Colunas que não podem ser alteradas por update direto.
revoke update on public.produtos from authenticated;
grant update (descricao, tamanho, cor, tipo, condicao, pertence, consignante_id, acordo_tipo, acordo_valor,
              custo, preco_venda, cadastrado_site, foto_path, observacoes, arquivado)
  on public.produtos to authenticated;
