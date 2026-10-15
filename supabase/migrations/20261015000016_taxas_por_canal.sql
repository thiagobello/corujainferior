-- =====================================================================
-- Taxas por canal + forma de pagamento.
--
-- Os sites também recebem por Pix, Débito e Crédito 1x/2x/3x, cada um com
-- sua taxa. Agora o CANAL (loja, site_coruja, site_arquibancada) e a FORMA
-- (pix, debito, credito_1x, credito_2x, credito_3x) são escolhidos
-- separadamente, e a taxa vem da combinação. Substitui a taxa única por
-- site da migration 15: as formas site_coruja/site_arquibancada viram
-- legado (ficam no enum, mas não são mais aceitas em vendas novas).
--
-- Divisão e repasse não mudam (ver migration 15): o canal diz quem está
-- com o dinheiro, sempre sobre o líquido após a taxa da combinação.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabela de taxas com chave (canal, forma). As linhas atuais viram canal
-- loja; a taxa única de cada site (se existir) semeia as 5 formas dele.
-- ---------------------------------------------------------------------
alter table public.taxas add column canal text not null default 'loja'
  check (canal in ('loja', 'site_coruja', 'site_arquibancada'));
alter table public.taxas drop constraint taxas_pkey;
alter table public.taxas add primary key (canal, forma);

insert into public.taxas (canal, forma, rotulo, percentual, parcelas, liquidacao, ordem)
select s.canal, l.forma, l.rotulo,
       coalesce(antiga.percentual, 0), 1,
       coalesce(antiga.liquidacao, 'proximo_dia_util'), l.ordem
from (values ('site_coruja'), ('site_arquibancada')) s(canal)
cross join public.taxas l
left join public.taxas antiga on antiga.canal = 'loja' and antiga.forma::text = s.canal
where l.canal = 'loja' and l.forma in ('pix', 'debito', 'credito_1x', 'credito_2x', 'credito_3x')
on conflict (canal, forma) do nothing;

delete from public.taxas where canal = 'loja' and forma in ('site_coruja', 'site_arquibancada');

alter table public.taxas_historico add column canal text not null default 'loja';

-- ---------------------------------------------------------------------
-- Canal passa a ser informado na venda (não sai mais da forma).
-- ---------------------------------------------------------------------
drop trigger if exists vendas_definir_canal on public.vendas;
drop function if exists public.vendas_definir_canal();

-- ---------------------------------------------------------------------
-- Configuração das taxas (admin).
-- ---------------------------------------------------------------------
drop function if exists public.atualizar_taxa(public.forma_pagamento, numeric);
create function public.atualizar_taxa(p_forma public.forma_pagamento, p_percentual numeric, p_canal text default 'loja')
returns void language plpgsql security definer set search_path = public as $$
declare v_ant numeric;
begin
  perform public.exigir_admin();
  if p_percentual is null or p_percentual < 0 or p_percentual >= 100 then
    raise exception 'Percentual inválido';
  end if;
  select percentual into v_ant from public.taxas where canal = p_canal and forma = p_forma for update;
  if not found then raise exception 'Taxa não encontrada'; end if;
  update public.taxas set percentual = p_percentual, atualizado_em = now(), atualizado_por = auth.uid()
   where canal = p_canal and forma = p_forma;
  insert into public.taxas_historico (canal, forma, percentual_anterior, percentual_novo)
  values (p_canal, p_forma, v_ant, p_percentual);
end $$;

-- Recebimento editável só nos sites (a loja segue Pix na hora e cartão no
-- próximo dia útil, decisão de 2026-10-13).
drop function if exists public.definir_liquidacao_taxa(public.forma_pagamento, text);
create function public.definir_liquidacao_taxa(p_canal text, p_forma public.forma_pagamento, p_liquidacao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_admin();
  if p_canal not in ('site_coruja', 'site_arquibancada') then
    raise exception 'Só o recebimento das vendas pelo site pode ser alterado';
  end if;
  if p_liquidacao not in ('imediata', 'proximo_dia_util') then
    raise exception 'Recebimento inválido';
  end if;
  update public.taxas set liquidacao = p_liquidacao, atualizado_em = now(), atualizado_por = auth.uid()
   where canal = p_canal and forma = p_forma;
  if not found then raise exception 'Taxa não encontrada'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Núcleo da venda: taxa pela combinação canal + forma; grava o canal.
-- ---------------------------------------------------------------------
drop function if exists public._inserir_venda(uuid, jsonb, public.forma_pagamento, date, text, text, boolean, text,
                                             boolean, text, numeric);
create function public._inserir_venda(
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
  p_taxa_percentual numeric default null,
  p_canal text default 'loja'
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

  -- Taxa da combinação canal + forma (ex.: Site Arquibancada · Crédito 3x).
  select * into v_taxa from public.taxas where canal = p_canal and forma = p_forma;
  if not found and p_taxa_percentual is null then
    raise exception 'Taxa não configurada para % · %', p_canal, p_forma;
  end if;
  v_pct := coalesce(p_taxa_percentual, v_taxa.percentual);

  insert into public.vendas (idempotency_key, data_venda, forma, forma_original, taxa_percentual,
                             cliente, observacoes, origem, canal)
  values (p_chave, v_data, p_forma, p_forma_original, v_pct,
          nullif(trim(p_cliente), ''), nullif(trim(p_observacoes), ''), p_origem, p_canal)
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

-- ---------------------------------------------------------------------
-- Entrada pública da venda, agora com o canal.
-- ---------------------------------------------------------------------
drop function if exists public.registrar_venda(uuid, jsonb, public.forma_pagamento, date, text, text, boolean, text);
create function public.registrar_venda(
  p_chave uuid,
  p_itens jsonb,
  p_forma public.forma_pagamento,
  p_data date default null,
  p_cliente text default null,
  p_observacoes text default null,
  p_pagamento_pendente boolean default false,
  p_origem text default 'venda',
  p_canal text default 'loja'
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_usuario();
  -- 'outro' e as formas únicas por site (migration 15) são legado.
  if p_forma not in ('pix', 'debito', 'credito_1x', 'credito_2x', 'credito_3x') then
    raise exception 'Escolha uma forma de pagamento válida';
  end if;
  if coalesce(p_canal, '') not in ('loja', 'site_coruja', 'site_arquibancada') then
    raise exception 'Canal inválido';
  end if;
  if p_origem not in ('venda', 'baixa_rapida', 'avulsa') then raise exception 'Origem inválida'; end if;
  if p_chave is null then raise exception 'Chave da venda ausente'; end if;
  return public._inserir_venda(p_chave, p_itens, p_forma, p_data, p_cliente, p_observacoes,
                               coalesce(p_pagamento_pendente, false), p_origem, false, null, null, p_canal);
end $$;

revoke execute on function public._inserir_venda from public, anon, authenticated;
revoke execute on function public.registrar_venda, public.atualizar_taxa, public.definir_liquidacao_taxa from public, anon;
grant execute on function public.registrar_venda, public.atualizar_taxa, public.definir_liquidacao_taxa to authenticated;
