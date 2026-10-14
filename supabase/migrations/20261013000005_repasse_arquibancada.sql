-- Todo o dinheiro das vendas entra na maquininha da Coruja; por isso tudo o
-- que é atribuído à Arquibancada Inferior fica pendente de repasse:
-- produtos "Arquibancada Inferior" (100% do líquido), "Ambos" (50%) e a
-- comissão de concessão quando destinada à Arquibancada.
create or replace view public.repasse_pendente with (security_invoker = true) as
select
  l.id as lancamento_id,
  l.venda_id,
  vi.produto_id,
  p.codigo,
  p.descricao,
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
join public.produtos p on p.id = vi.produto_id
where l.beneficiario = 'arquibancada'
  and (
    (l.ativo and v.status = 'concluida' and l.repasse_id is null)
    or (not l.ativo and l.repasse_id is not null and l.estorno_repasse_id is null)
  );
