-- =====================================================================
-- Venda em dinheiro (pedido do Thiago, 2026-10-20).
--
-- Dinheiro não tem desconto de taxa: o líquido é o próprio valor da venda.
-- Divisão entre marcas, concessão e repasse seguem as regras de sempre,
-- sobre esse líquido. Recebido na hora, como o Pix.
--
-- A taxa 0 é garantida aqui, não por uma linha em `taxas`: Dinheiro não
-- tem linha de taxa (o check abaixo impede criar uma) e registrar_venda
-- força o percentual 0. Sem linha de taxa, _criar_pagamentos trata o
-- recebimento como imediato.
--
-- Só no canal Loja: venda pelo site não é paga em espécie.
-- =====================================================================

alter table public.taxas add constraint taxas_sem_dinheiro check (forma <> 'dinheiro');

create or replace function public.atualizar_taxa(p_forma public.forma_pagamento, p_percentual numeric, p_canal text default 'loja')
returns void language plpgsql security definer set search_path = public as $$
declare v_ant numeric;
begin
  perform public.exigir_admin();
  if p_forma = 'dinheiro' then raise exception 'Dinheiro não tem taxa'; end if;
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

create or replace function public.registrar_venda(
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
  if p_forma not in ('pix', 'dinheiro', 'debito', 'credito_1x', 'credito_2x', 'credito_3x') then
    raise exception 'Escolha uma forma de pagamento válida';
  end if;
  if coalesce(p_canal, '') not in ('loja', 'site_coruja', 'site_arquibancada') then
    raise exception 'Canal inválido';
  end if;
  if p_forma = 'dinheiro' and p_canal <> 'loja' then
    raise exception 'Dinheiro só nas vendas da loja';
  end if;
  if p_origem not in ('venda', 'baixa_rapida', 'avulsa') then raise exception 'Origem inválida'; end if;
  if p_chave is null then raise exception 'Chave da venda ausente'; end if;
  -- Dinheiro: percentual 0 forçado (não depende de configuração).
  return public._inserir_venda(p_chave, p_itens, p_forma, p_data, p_cliente, p_observacoes,
                               coalesce(p_pagamento_pendente, false), p_origem, false, null,
                               case when p_forma = 'dinheiro' then 0 end, p_canal);
end $$;

revoke execute on function public.registrar_venda, public.atualizar_taxa from public, anon;
grant execute on function public.registrar_venda, public.atualizar_taxa to authenticated;
