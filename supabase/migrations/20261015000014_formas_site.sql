-- =====================================================================
-- Formas de pagamento das vendas pelo site (Coruja e Arquibancada).
--
-- Fica sozinha nesta migration de propósito: o Postgres não deixa usar um
-- valor novo de enum na mesma transação em que ele foi criado. As taxas,
-- o canal da venda e os repasses que usam estes valores estão na
-- migration seguinte (20261015000015_venda_site.sql). Rode esta antes.
-- =====================================================================

alter type public.forma_pagamento add value if not exists 'site_coruja';
alter type public.forma_pagamento add value if not exists 'site_arquibancada';
