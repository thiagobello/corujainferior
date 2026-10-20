-- =====================================================================
-- Forma de pagamento "Dinheiro".
--
-- Fica sozinha nesta migration de propósito (como a 14): o Postgres não
-- deixa usar um valor novo de enum na mesma transação em que ele foi
-- criado. As regras do Dinheiro (taxa sempre 0, só na loja) estão na
-- migration seguinte (20261020000018_venda_dinheiro.sql). Rode esta antes,
-- sozinha.
-- =====================================================================

alter type public.forma_pagamento add value if not exists 'dinheiro';
