-- =====================================================================
-- Venda pelo site (Coruja ou Arquibancada).
--
-- Canal da venda: loja (maquininha da Coruja), site_coruja (dinheiro entra
-- na conta da Coruja) ou site_arquibancada (dinheiro entra na conta da
-- Arquibancada). O canal sai da forma de pagamento: cada site tem uma
-- forma/taxa própria (Mais › Taxas).
--
-- A divisão do líquido entre marcas (lançamentos) não muda com o canal.
-- O que muda é QUEM está com o dinheiro e, portanto, o sentido do repasse:
--   loja / site_coruja  → a Coruja deve à Arquibancada a parte dela
--                         (valor positivo no repasse, como sempre foi);
--   site_arquibancada   → a Arquibancada deve à Coruja a parte da Coruja
--                         (Ambos, 100% Coruja, comissão de concessão da
--                         Coruja). Entra no repasse com valor negativo e
--                         abate o que a Coruja tem a repassar. A parte do
--                         proprietário da concessão fica fora do acerto entre
--                         as marcas (ele recebe por conta própria).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Taxas próprias dos sites. Começam em 0% e caem no próximo dia útil
-- (mais conservador: não conta como recebido no mesmo dia). O admin
-- muda percentual e recebimento em Mais › Taxas.
-- ---------------------------------------------------------------------
insert into public.taxas (forma, rotulo, percentual, parcelas, liquidacao, ordem) values
  ('site_coruja', 'Site Coruja', 0, 1, 'proximo_dia_util', 10),
  ('site_arquibancada', 'Site Arquibancada', 0, 1, 'proximo_dia_util', 11)
on conflict (forma) do nothing;

-- Recebimento das taxas dos sites (na hora ou no próximo dia útil).
-- As formas da loja seguem a decisão de 2026-10-13 (Pix na hora, cartão
-- no próximo dia útil) e não são alteradas por aqui.
create function public.definir_liquidacao_taxa(p_forma public.forma_pagamento, p_liquidacao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_admin();
  if p_forma not in ('site_coruja', 'site_arquibancada') then
    raise exception 'Só o recebimento das vendas pelo site pode ser alterado';
  end if;
  if p_liquidacao not in ('imediata', 'proximo_dia_util') then
    raise exception 'Recebimento inválido';
  end if;
  update public.taxas set liquidacao = p_liquidacao, atualizado_em = now(), atualizado_por = auth.uid()
   where forma = p_forma;
end $$;

-- ---------------------------------------------------------------------
-- Canal da venda (definido pela forma, nunca informado à parte, para não
-- existir venda "loja" com taxa de site ou o contrário).
-- ---------------------------------------------------------------------
alter table public.vendas
  add column canal text not null default 'loja'
  check (canal in ('loja', 'site_coruja', 'site_arquibancada'));

create function public.vendas_definir_canal() returns trigger
language plpgsql set search_path = public as $$
begin
  new.canal := case new.forma::text
                 when 'site_coruja' then 'site_coruja'
                 when 'site_arquibancada' then 'site_arquibancada'
                 else 'loja'
               end;
  return new;
end $$;

create trigger vendas_definir_canal before insert or update of forma, canal on public.vendas
  for each row execute function public.vendas_definir_canal();

-- ---------------------------------------------------------------------
-- Recebimentos: quem recebe o dinheiro. Venda no site da Arquibancada cai
-- na conta dela, não na da Coruja.
-- ---------------------------------------------------------------------
create or replace view public.pagamentos_situacao with (security_invoker = true) as
select
  pg.*,
  v.data_venda, v.cliente, v.forma, v.status as status_venda,
  (pg.status = 'recebido'
   or (pg.status = 'pendente' and pg.liquidacao = 'automatica'
       and pg.vencimento <= (now() at time zone 'America/Sao_Paulo')::date)) as recebido,
  case when pg.status = 'recebido' then pg.recebido_em else pg.vencimento end as data_recebimento,
  v.canal,
  case when v.canal = 'site_arquibancada' then 'arquibancada' else 'coruja' end as recebedor
from public.pagamentos pg
join public.vendas v on v.id = pg.venda_id
where pg.status <> 'cancelado' and v.status = 'concluida';

-- ---------------------------------------------------------------------
-- Repasse pendente nos dois sentidos.
--   valor > 0 → a Coruja deve à Arquibancada
--   valor < 0 → a Arquibancada deve à Coruja (venda no site dela)
-- Venda cancelada depois do repasse vira estorno com o sinal invertido.
-- ---------------------------------------------------------------------
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
  -- Positivo quando é venda ativa da loja/site Coruja ou estorno de venda
  -- do site da Arquibancada; negativo nos outros dois casos.
  case when l.ativo = (v.canal <> 'site_arquibancada') then l.valor else -l.valor end as valor,
  vi.pertence,
  v.canal,
  l.beneficiario
from public.lancamentos l
join public.venda_itens vi on vi.id = l.venda_item_id
join public.vendas v on v.id = l.venda_id
left join public.produtos p on p.id = vi.produto_id
where (
    (v.canal <> 'site_arquibancada' and l.beneficiario = 'arquibancada')
    or (v.canal = 'site_arquibancada' and l.beneficiario = 'coruja')
  )
  and (
    (l.ativo and v.status = 'concluida' and l.repasse_id is null)
    or (not l.ativo and l.repasse_id is not null and l.estorno_repasse_id is null)
  );

-- ---------------------------------------------------------------------
-- Painel: vendas por canal; recebimentos separados por quem recebeu.
-- ---------------------------------------------------------------------
create or replace function public.resumo_financeiro(p_inicio date, p_fim date, p_marca text default null) returns jsonb
language sql stable security invoker set search_path = public as $$
  with itens as (
    select vi.*, v.forma, v.canal, v.data_venda, coalesce(p.descricao, vi.descricao) as nome
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
    -- Mesmos itens, agrupados por canal: a soma dos canais é o faturamento.
    'por_canal', coalesce((
      select jsonb_agg(jsonb_build_object('canal', canal, 'vendas', n, 'bruto', bruto, 'liquido', liq)
                       order by array_position(array['loja', 'site_coruja', 'site_arquibancada'], canal))
      from (select canal, count(distinct venda_id) n, sum(valor_bruto) bruto, sum(valor_liquido) liq
            from itens group by canal) c), '[]'::jsonb),
    'mais_vendidos', coalesce((
      select jsonb_agg(jsonb_build_object('descricao', nome, 'quantidade', n, 'bruto', bruto) order by n desc, bruto desc)
      from (select nome, sum(quantidade) n, sum(valor_bruto) bruto from itens
            group by nome order by sum(quantidade) desc, sum(valor_bruto) desc limit 10) t), '[]'::jsonb),
    -- Recebimentos da Coruja (loja e site Coruja). O que entrou na conta
    -- da Arquibancada (site dela) fica à parte, para não inflar o caixa.
    'recebido_periodo', (select coalesce(sum(valor_liquido), 0) from pag
                         where recebedor = 'coruja' and recebido and data_recebimento between p_inicio and p_fim),
    'a_receber', (select coalesce(sum(valor_liquido), 0) from pag where recebedor = 'coruja' and not recebido),
    'pagamentos_pendentes', (select count(*) from pag where recebedor = 'coruja' and not recebido and liquidacao = 'manual'),
    'valor_pendente_manual', (select coalesce(sum(valor_liquido), 0) from pag
                              where recebedor = 'coruja' and not recebido and liquidacao = 'manual'),
    'recebido_arquibancada', (select coalesce(sum(valor_liquido), 0) from pag
                              where recebedor = 'arquibancada' and recebido and data_recebimento between p_inicio and p_fim),
    'a_receber_arquibancada', (select coalesce(sum(valor_liquido), 0) from pag where recebedor = 'arquibancada' and not recebido),
    'reservas_ativas', (select count(*) from public.reservas where encerrada_em is null and tipo = 'reserva'),
    'emprestimos_ativos', (select count(*) from public.reservas where encerrada_em is null and tipo = 'emprestimo'),
    'alertas_site', (select count(*) from public.alertas_site where status in ('pendente', 'adiado'))
  )
$$;

revoke execute on function public.definir_liquidacao_taxa, public.vendas_definir_canal from public, anon;
revoke execute on function public.vendas_definir_canal from authenticated;
grant execute on function public.definir_liquidacao_taxa to authenticated;
