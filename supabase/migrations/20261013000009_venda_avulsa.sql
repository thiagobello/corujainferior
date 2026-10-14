-- =====================================================================
-- Venda avulsa: itens sem cadastro no estoque (ex.: isqueiros), lançados
-- na hora da venda com descrição, quantidade, valor e a quem pertencem.
-- Seguem as mesmas regras de taxa, divisão entre marcas e repasse.
-- =====================================================================

alter table public.venda_itens
  alter column produto_id drop not null,
  add column descricao text,
  add column quantidade integer not null default 1 check (quantidade > 0),
  add constraint venda_itens_produto_ou_descricao
    check (produto_id is not null or length(trim(coalesce(descricao, ''))) > 0);

-- Mesmo núcleo da venda, agora aceitando itens avulsos:
--   {produto_id, valor_bruto}                                  → produto do estoque
--   {descricao, quantidade, valor_bruto, pertence, consignante_id} → avulso
-- valor_bruto é sempre o total do item (quantidade × valor unitário).
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
  v_n integer;
  k integer;
  v_pb numeric(12, 2);
  v_pt numeric(12, 2);
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

-- Origem "avulsa" para vendas lançadas pela tela de item sem cadastro.
alter table public.vendas drop constraint vendas_origem_check;
alter table public.vendas add constraint vendas_origem_check
  check (origem in ('venda', 'baixa_rapida', 'avulsa', 'importacao'));

create or replace function public.registrar_venda(
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
  if p_origem not in ('venda', 'baixa_rapida', 'avulsa') then raise exception 'Origem inválida'; end if;
  if p_chave is null then raise exception 'Chave da venda ausente'; end if;
  return public._inserir_venda(p_chave, p_itens, p_forma, p_data, p_cliente, p_observacoes,
                               coalesce(p_pagamento_pendente, false), p_origem);
end $$;

-- Repasses: itens avulsos não têm produto (usa a descrição do item).
create or replace view public.repasse_pendente with (security_invoker = true) as
select
  l.id as lancamento_id,
  l.venda_id,
  vi.produto_id,
  p.codigo,
  coalesce(p.descricao, vi.descricao) as descricao,
  p.tamanho,
  vi.valor_bruto,
  vi.valor_liquido,
  case when l.ativo then 'venda' else 'estorno' end as tipo,
  case when l.ativo then v.data_venda else (v.cancelada_em at time zone 'America/Sao_Paulo')::date end as data_ref,
  case when l.ativo then l.valor else -l.valor end as valor,
  vi.pertence
from public.lancamentos l
join public.venda_itens vi on vi.id = l.venda_item_id
join public.vendas v on v.id = l.venda_id
left join public.produtos p on p.id = vi.produto_id
where l.beneficiario = 'arquibancada'
  and (
    (l.ativo and v.status = 'concluida' and l.repasse_id is null)
    or (not l.ativo and l.repasse_id is not null and l.estorno_repasse_id is null)
  );

-- Painel: itens avulsos entram nos totais; quantidade conta nos "mais vendidos".
create or replace function public.resumo_financeiro(p_inicio date, p_fim date, p_marca text default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with itens as (
    select vi.*, v.forma, v.data_venda, coalesce(p.descricao, vi.descricao) as nome
    from public.venda_itens vi
    join public.vendas v on v.id = vi.venda_id
    left join public.produtos p on p.id = vi.produto_id
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
    'itens', (select coalesce(sum(quantidade), 0) from itens),
    'bruto', (select coalesce(sum(valor_bruto), 0) from itens),
    'descontos', (select coalesce(sum(desconto), 0) from itens),
    'taxas', (select coalesce(sum(taxa_valor), 0) from itens),
    'liquido', (select coalesce(sum(valor_liquido), 0) from itens),
    'custos', (select coalesce(sum(custo), 0) from itens),
    'itens_sem_custo', (select count(*) from itens where custo is null),
    'lucro_bruto', (select coalesce(sum(lucro_bruto), 0) from itens),
    'resultado', (select coalesce(sum(resultado), 0) from itens),
    'avulsos', (select coalesce(sum(valor_bruto), 0) from itens where produto_id is null),
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
      select jsonb_agg(jsonb_build_object('descricao', nome, 'quantidade', n, 'bruto', bruto) order by n desc, bruto desc)
      from (select nome, sum(quantidade) n, sum(valor_bruto) bruto from itens
            group by nome order by sum(quantidade) desc, sum(valor_bruto) desc limit 10) t), '[]'::jsonb),
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
