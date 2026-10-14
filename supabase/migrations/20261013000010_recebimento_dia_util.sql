-- =====================================================================
-- Recebimento no próximo dia útil: débito e crédito (1x, 2x, 3x) caem na
-- conta de uma vez no dia útil seguinte à venda. Não há parcelas futuras.
-- Pix continua recebido na hora.
-- =====================================================================

alter table public.taxas drop constraint taxas_liquidacao_check;
alter table public.taxas add constraint taxas_liquidacao_check
  check (liquidacao in ('imediata', 'proximo_dia_util', 'mensal'));

update public.taxas set liquidacao = 'proximo_dia_util', parcelas = 1
where forma in ('debito', 'credito_1x', 'credito_2x', 'credito_3x');

-- Próximo dia útil (segunda a sexta). Feriados não são considerados.
create function public.proximo_dia_util(p_data date) returns date
language sql immutable as $$
  select case extract(isodow from p_data)
           when 5 then p_data + 3   -- sexta → segunda
           when 6 then p_data + 2   -- sábado → segunda
           else p_data + 1          -- domingo a quinta → dia seguinte
         end
$$;

-- Recebimentos da venda conforme a forma de pagamento.
--   imediata          → recebido na data da venda
--   proximo_dia_util  → uma parcela, conta como recebida no dia útil seguinte
--   mensal            → parcelas mensais (mantido para uso futuro)
-- Pagamento marcado como pendente só conta depois de baixado manualmente.
create function public._criar_pagamentos(
  p_venda uuid, p_taxa public.taxas, p_data date, p_bruto numeric, p_taxa_total numeric,
  p_pendente boolean, p_importacao boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_n integer := case when coalesce(p_taxa.liquidacao, 'imediata') = 'mensal' then greatest(coalesce(p_taxa.parcelas, 1), 1) else 1 end;
  k integer;
  v_pb numeric(12, 2);
  v_pt numeric(12, 2);
  v_venc date;
  v_recebido boolean;
begin
  for k in 1 .. v_n loop
    v_pb := trunc(p_bruto / v_n, 2);
    v_pt := trunc(p_taxa_total / v_n, 2);
    if k = 1 then
      v_pb := p_bruto - v_pb * (v_n - 1);
      v_pt := p_taxa_total - v_pt * (v_n - 1);
    end if;
    v_venc := case coalesce(p_taxa.liquidacao, 'imediata')
                when 'mensal' then (p_data + make_interval(months => k))::date
                when 'proximo_dia_util' then public.proximo_dia_util(p_data)
                else p_data
              end;
    v_recebido := p_importacao or (not p_pendente and coalesce(p_taxa.liquidacao, 'imediata') = 'imediata');
    insert into public.pagamentos (venda_id, parcela, total_parcelas, valor_bruto, taxa_valor, valor_liquido,
                                   vencimento, liquidacao, status, recebido_em)
    values (p_venda, k, v_n, v_pb, v_pt, v_pb - v_pt, v_venc,
            case when not p_pendente and not p_importacao and p_taxa.liquidacao <> 'imediata' then 'automatica' else 'manual' end,
            case when v_recebido then 'recebido' else 'pendente' end,
            case when v_recebido then p_data end);
  end loop;
end $$;

revoke execute on function public._criar_pagamentos from public, anon, authenticated;
grant execute on function public.proximo_dia_util to authenticated;

create or replace function public._inserir_venda(
  p_chave uuid,
  p_itens jsonb,
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
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa ter ao menos um item';
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
    select id into v_venda from public.vendas where idempotency_key = p_chave;
    return v_venda;
  end if;

  perform set_config('app.operacao', 'venda', true);

  for it in
    select (x ->> 'produto_id')::uuid as produto_id,
           (x ->> 'valor_bruto')::numeric as valor_bruto,
           nullif(trim(x ->> 'descricao'), '') as descricao,
           coalesce((x ->> 'quantidade')::integer, 1) as quantidade,
           (x ->> 'pertence')::public.pertence_produto as pertence,
           (x ->> 'consignante_id')::uuid as consignante_id
    from jsonb_array_elements(p_itens) x
    order by 1 nulls last
  loop
    if it.valor_bruto is null or it.valor_bruto < 0 or it.valor_bruto <> round(it.valor_bruto, 2) then
      raise exception 'Valor de venda inválido';
    end if;
    v_taxa_item := round(it.valor_bruto * v_pct / 100, 2);

    if it.produto_id is null then
      -- Item avulso (sem cadastro): não mexe em estoque.
      if it.descricao is null then raise exception 'Informe a descrição do item avulso'; end if;
      if it.quantidade < 1 then raise exception 'Quantidade inválida para %', it.descricao; end if;
      if it.pertence is null then raise exception 'Informe a quem pertence o item %', it.descricao; end if;
      if it.pertence = 'Concessão' and it.consignante_id is null then
        raise exception 'Escolha o proprietário da concessão do item %', it.descricao;
      end if;

      insert into public.venda_itens (venda_id, produto_id, descricao, quantidade, preco_padrao, custo, pertence,
                                      consignante_id, valor_bruto, taxa_percentual, taxa_valor, valor_liquido,
                                      lucro_bruto, resultado)
      values (v_venda, null, it.descricao, it.quantidade, it.valor_bruto, null, it.pertence,
              case when it.pertence = 'Concessão' then it.consignante_id end,
              it.valor_bruto, v_pct, v_taxa_item, it.valor_bruto - v_taxa_item,
              it.valor_bruto, it.valor_bruto - v_taxa_item)
      returning id into v_item;

      perform public._dividir_item(v_venda, v_item, it.valor_bruto - v_taxa_item, it.pertence,
                                   case when it.pertence = 'Concessão' then it.consignante_id end, null, null);
    else
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
    end if;

    v_bruto := v_bruto + it.valor_bruto;
    v_taxa_total := v_taxa_total + v_taxa_item;
  end loop;

  update public.vendas set valor_bruto = v_bruto, taxa_valor = v_taxa_total,
                           valor_liquido = v_bruto - v_taxa_total
  where id = v_venda;

  perform public._criar_pagamentos(v_venda, v_taxa, v_data, v_bruto, v_taxa_total,
                                  coalesce(p_pagamento_pendente, false), p_importacao);
  perform set_config('app.operacao', '', true);
  return v_venda;
end $$;
