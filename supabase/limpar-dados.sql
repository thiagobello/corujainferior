-- =====================================================================
-- LIMPAR DADOS (não é migration — rode manualmente no SQL Editor)
-- =====================================================================
-- Apaga: produtos, histórico, reservas, vendas, recebimentos, divisão
-- entre marcas, repasses, alertas do site e orçamentos.
-- Mantém: usuários (auth.users e perfis), categorias, taxas, serviços e
-- status de orçamento, proprietários de concessão.
-- IRREVERSÍVEL. As fotos do armazenamento são apagadas à parte (painel).
-- =====================================================================

begin;

truncate table
  public.alertas_site,
  public.lancamentos,
  public.pagamentos,
  public.venda_itens,
  public.vendas,
  public.repasses,
  public.reservas,
  public.movimentacoes,
  public.produtos,
  public.orcamento_historico,
  public.orcamento_itens,
  public.orcamento_pecas,
  public.orcamentos,
  public.taxas_historico
restart identity;   -- numeração dos orçamentos volta para 0001

-- Códigos de produto voltam a começar do 001 em todas as categorias.
update public.prefixos set proximo = 1;

commit;

-- ---------------------------------------------------------------------
-- OPCIONAIS (rode só se quiser)
-- ---------------------------------------------------------------------
-- Apagar também os proprietários de concessão:
--   truncate table public.consignantes;
--
-- Apagar as categorias criadas depois (mantém as 9 originais):
--   delete from public.prefixos where prefixo not in ('A','B','F','I','M','S','AI','SA','C');
--
-- Zerar as taxas de pagamento:
--   update public.taxas set percentual = 0;
