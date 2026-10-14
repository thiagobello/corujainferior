-- =====================================================================
-- Coruja Inferior — estoque, vendas e financeiro (Coruja Sports + Arquibancada Inferior)
-- =====================================================================
-- Regras centrais:
--   * Cada unidade física é um registro em `produtos` com código único.
--   * Status só muda via funções (reserva, empréstimo, venda, importação).
--   * Venda é atômica, idempotente (idempotency_key) e um produto só pode
--     estar em um item de venda ativo (índice único parcial).
--   * Valores monetários em numeric(12,2); arredondamento round(x, 2)
--     (meio para longe do zero), igual ao cálculo do app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.tipo_produto as enum ('Réplica', 'Original', 'Própria');
create type public.condicao_produto as enum ('Nova', 'Usada');
create type public.pertence_produto as enum ('Coruja Sports', 'Arquibancada Inferior', 'Concessão', 'Ambos');
create type public.status_produto as enum ('Disponível', 'Vendida', 'Reservada', 'Emprestada');
create type public.forma_pagamento as enum ('pix', 'debito', 'credito_1x', 'credito_2x', 'credito_3x', 'outro');
create type public.papel_usuario as enum ('admin', 'vendedor');

-- ---------------------------------------------------------------------
-- Usuários
-- ---------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text,
  papel public.papel_usuario not null default 'vendedor',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- O primeiro usuário cadastrado vira admin; os demais entram como vendedor.
create function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome, papel)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.perfis) then 'vendedor' else 'admin' end::public.papel_usuario
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();

create function public.papel_atual() returns public.papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create function public.exigir_usuario() returns public.papel_usuario
language plpgsql stable security definer set search_path = public as $$
declare v public.papel_usuario;
begin
  v := public.papel_atual();
  if v is null then raise exception 'Usuário não autenticado ou inativo' using errcode = '42501'; end if;
  return v;
end $$;

create function public.exigir_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.exigir_usuario() <> 'admin' then
    raise exception 'Apenas administradores podem executar esta ação' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Prefixos e geração de códigos (nunca reutiliza: contador só cresce)
-- ---------------------------------------------------------------------
create table public.prefixos (
  prefixo text primary key check (prefixo ~ '^[A-Z]{1,3}$'),
  descricao text not null,
  proximo integer not null default 1 check (proximo > 0),
  digitos integer not null default 3 check (digitos between 2 and 6)
);

insert into public.prefixos (prefixo, descricao) values
  ('A', 'Agasalho'), ('B', 'Boné'), ('F', 'Feminino'), ('I', 'Infantil'),
  ('M', 'Masculino'), ('S', 'Shorts'), ('AI', 'Arquibancada Inferior'),
  ('SA', 'Ecobag/Sacola'), ('C', 'Caixa Promo');

-- Extrai prefixo e número de um código (ex.: 'AI012' -> ('AI', 12)).
create function public.decompor_codigo(p_codigo text, out prefixo text, out numero integer)
language sql immutable as $$
  select m[1], m[2]::integer
  from regexp_match(upper(trim(p_codigo)), '^(AI|SA|A|B|C|F|I|M|S)0*(\d+)$') as m
$$;

-- ---------------------------------------------------------------------
-- Concessão (proprietários de peças consignadas)
-- ---------------------------------------------------------------------
create table public.consignantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  contato text,
  -- 'percentual': proprietário recebe X% do valor líquido (após taxa).
  -- 'fixo': proprietário recebe um valor fixo por peça vendida.
  tipo_acordo text not null default 'percentual' check (tipo_acordo in ('percentual', 'fixo')),
  valor_acordo numeric(12, 2) not null default 100 check (valor_acordo >= 0),
  -- Marca que fica com o restante após pagar o proprietário.
  marca_restante text not null default 'coruja' check (marca_restante in ('coruja', 'arquibancada', 'ambos')),
  observacoes text,
  criado_em timestamptz not null default now(),
  check (tipo_acordo <> 'percentual' or valor_acordo <= 100)
);

-- ---------------------------------------------------------------------
-- Produtos (uma linha por unidade física)
-- ---------------------------------------------------------------------
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-Z]{1,3}[0-9]+$'),
  prefixo text not null references public.prefixos (prefixo),
  descricao text not null check (length(trim(descricao)) > 0),
  tamanho text,
  cor text,
  tipo public.tipo_produto,
  condicao public.condicao_produto,
  pertence public.pertence_produto not null,
  consignante_id uuid references public.consignantes (id),
  -- Acordo específico da peça (sobrepõe o do consignante quando informado).
  acordo_tipo text check (acordo_tipo in ('percentual', 'fixo')),
  acordo_valor numeric(12, 2) check (acordo_valor >= 0),
  custo numeric(12, 2) check (custo >= 0),
  preco_venda numeric(12, 2) not null check (preco_venda >= 0),
  lucro_estimado numeric(12, 2) generated always as (preco_venda - coalesce(custo, 0)) stored,
  status public.status_produto not null default 'Disponível',
  cadastrado_site boolean, -- null = não verificado
  foto_path text,
  observacoes text,
  codigo_original text,      -- código da planilha quando foi preciso trocar
  dados_origem jsonb,        -- valores brutos importados que não foram mapeados
  import_chave text unique,  -- evita duplicar em importações repetidas
  arquivado boolean not null default false,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (pertence <> 'Concessão' or acordo_tipo is null or acordo_valor is not null)
);

create index produtos_status_idx on public.produtos (status) where not arquivado;
create index produtos_prefixo_idx on public.produtos (prefixo);
create index produtos_descricao_idx on public.produtos (lower(descricao));

-- ---------------------------------------------------------------------
-- Histórico de movimentações
-- ---------------------------------------------------------------------
create table public.movimentacoes (
  id bigint generated always as identity primary key,
  produto_id uuid not null references public.produtos (id),
  tipo text not null check (tipo in (
    'cadastro', 'edicao', 'importacao', 'reserva', 'cancelamento_reserva',
    'emprestimo', 'devolucao', 'venda', 'cancelamento_venda',
    'site_removido', 'site_adiado', 'site_pendente'
  )),
  status_anterior public.status_produto,
  status_novo public.status_produto,
  detalhes jsonb,
  observacoes text,
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index movimentacoes_produto_idx on public.movimentacoes (produto_id, criado_em desc);

-- Status e código só mudam pelas funções do sistema.
create function public.produtos_guarda() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Disponível' and coalesce(current_setting('app.operacao', true), '') <> 'importacao' then
      raise exception 'Produto novo deve começar como Disponível';
    end if;
    new.codigo := upper(new.codigo);
    return new;
  end if;
  if new.codigo is distinct from old.codigo then
    raise exception 'O código do produto não pode ser alterado';
  end if;
  if new.status is distinct from old.status and coalesce(current_setting('app.operacao', true), '') = '' then
    raise exception 'Use reserva, empréstimo ou venda para mudar o status';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger produtos_guarda before insert or update on public.produtos
  for each row execute function public.produtos_guarda();

-- Registra cadastro e edições de campos (mudanças de status são
-- registradas pelas próprias funções com o tipo específico).
create function public.produtos_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_diff jsonb := '{}'::jsonb;
  k text;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.movimentacoes (produto_id, tipo, status_novo, detalhes)
    values (new.id,
            case when current_setting('app.operacao', true) = 'importacao' then 'importacao' else 'cadastro' end,
            new.status, jsonb_build_object('codigo', new.codigo));
    return new;
  end if;
  v_old := to_jsonb(old) - array['atualizado_em', 'status', 'lucro_estimado'];
  v_new := to_jsonb(new) - array['atualizado_em', 'status', 'lucro_estimado'];
  for k in select jsonb_object_keys(v_new) loop
    if v_new -> k is distinct from v_old -> k then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('de', v_old -> k, 'para', v_new -> k));
    end if;
  end loop;
  if v_diff <> '{}'::jsonb then
    insert into public.movimentacoes (produto_id, tipo, status_anterior, status_novo, detalhes)
    values (new.id, 'edicao', old.status, new.status, v_diff);
  end if;
  return new;
end $$;

create trigger produtos_historico after insert or update on public.produtos
  for each row execute function public.produtos_historico();

-- Gera o próximo código livre do prefixo, com trava na linha do prefixo.
create function public.gerar_codigo(p_prefixo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_num integer;
  v_dig integer;
  v_codigo text;
begin
  loop
    update public.prefixos set proximo = proximo + 1
      where prefixo = upper(p_prefixo)
      returning proximo - 1, digitos into v_num, v_dig;
    if v_num is null then raise exception 'Prefixo inválido: %', p_prefixo; end if;
    -- lpad trunca textos maiores que o tamanho: só completa com zeros.
    v_codigo := upper(p_prefixo) || case when length(v_num::text) >= v_dig then v_num::text
                                         else lpad(v_num::text, v_dig, '0') end;
    -- Pula números já usados por códigos importados (ex.: SA07 x SA007).
    exit when not exists (
      select 1 from public.produtos p
      where p.codigo = v_codigo
         or (p.prefixo = upper(p_prefixo) and (public.decompor_codigo(p.codigo)).numero = v_num)
    );
  end loop;
  return v_codigo;
end $$;

-- ---------------------------------------------------------------------
-- Reservas e empréstimos
-- ---------------------------------------------------------------------
create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id),
  tipo text not null check (tipo in ('reserva', 'emprestimo')),
  cliente text,
  observacoes text,
  previsao date,
  inicio timestamptz not null default now(),
  usuario_id uuid default auth.uid(),
  encerrada_em timestamptz,
  encerrada_por uuid,
  obs_encerramento text
);
create unique index reservas_uma_ativa_idx on public.reservas (produto_id) where encerrada_em is null;

-- ---------------------------------------------------------------------
-- Taxas por forma de pagamento (editáveis; vendas guardam o valor usado)
-- ---------------------------------------------------------------------
create table public.taxas (
  forma public.forma_pagamento primary key,
  rotulo text not null,
  percentual numeric(7, 4) not null default 0 check (percentual >= 0 and percentual < 100),
  parcelas integer not null default 1 check (parcelas between 1 and 12),
  liquidacao text not null default 'imediata' check (liquidacao in ('imediata', 'mensal')),
  ordem integer not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

insert into public.taxas (forma, rotulo, parcelas, liquidacao, ordem) values
  ('pix', 'Pix', 1, 'imediata', 1),
  ('debito', 'Débito', 1, 'imediata', 2),
  ('credito_1x', 'Crédito 1x', 1, 'mensal', 3),
  ('credito_2x', 'Crédito 2x', 2, 'mensal', 4),
  ('credito_3x', 'Crédito 3x', 3, 'mensal', 5),
  ('outro', 'Outro (importado)', 1, 'imediata', 99);

create table public.taxas_historico (
  id bigint generated always as identity primary key,
  forma public.forma_pagamento not null,
  percentual_anterior numeric(7, 4),
  percentual_novo numeric(7, 4) not null,
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Vendas, itens, recebimentos e lançamentos entre marcas
-- ---------------------------------------------------------------------
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  data_venda date not null default (now() at time zone 'America/Sao_Paulo')::date,
  forma public.forma_pagamento not null,
  forma_original text,          -- texto da planilha para vendas importadas
  taxa_percentual numeric(7, 4) not null,
  valor_bruto numeric(12, 2) not null default 0,
  taxa_valor numeric(12, 2) not null default 0,
  valor_liquido numeric(12, 2) not null default 0,
  cliente text,
  observacoes text,
  origem text not null default 'venda' check (origem in ('venda', 'baixa_rapida', 'importacao')),
  status text not null default 'concluida' check (status in ('concluida', 'cancelada')),
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  cancelada_em timestamptz,
  cancelada_por uuid,
  motivo_cancelamento text
);
create index vendas_data_idx on public.vendas (data_venda) where status = 'concluida';

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id),
  produto_id uuid not null references public.produtos (id),
  -- Fotografia do produto no momento da venda:
  preco_padrao numeric(12, 2) not null,
  custo numeric(12, 2),
  pertence public.pertence_produto not null,
  consignante_id uuid references public.consignantes (id),
  -- Valores da venda:
  valor_bruto numeric(12, 2) not null check (valor_bruto >= 0),
  desconto numeric(12, 2) generated always as (preco_padrao - valor_bruto) stored,
  taxa_percentual numeric(7, 4) not null,
  taxa_valor numeric(12, 2) not null,
  valor_liquido numeric(12, 2) not null,
  lucro_bruto numeric(12, 2) not null,       -- bruto − custo
  resultado numeric(12, 2) not null,         -- bruto − custo − taxa
  ativo boolean not null default true,
  check (valor_liquido = valor_bruto - taxa_valor),
  check (resultado = lucro_bruto - taxa_valor)
);
-- Impede venda duplicada da mesma unidade.
create unique index venda_itens_produto_ativo_idx on public.venda_itens (produto_id) where ativo;
create index venda_itens_venda_idx on public.venda_itens (venda_id);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id),
  parcela integer not null default 1,
  total_parcelas integer not null default 1,
  valor_bruto numeric(12, 2) not null,
  taxa_valor numeric(12, 2) not null,
  valor_liquido numeric(12, 2) not null,
  vencimento date not null,
  -- 'automatica': parcela de cartão, considerada recebida na data de vencimento.
  -- 'manual': só conta como recebida quando alguém marca o recebimento.
  liquidacao text not null check (liquidacao in ('automatica', 'manual')),
  status text not null default 'pendente' check (status in ('pendente', 'recebido', 'cancelado')),
  recebido_em date,
  check (valor_liquido = valor_bruto - taxa_valor)
);
create index pagamentos_venda_idx on public.pagamentos (venda_id);

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id),
  venda_item_id uuid not null references public.venda_itens (id),
  beneficiario text not null check (beneficiario in ('coruja', 'arquibancada', 'consignante')),
  consignante_id uuid references public.consignantes (id),
  valor numeric(12, 2) not null,
  descricao text,
  ativo boolean not null default true
);
create index lancamentos_venda_idx on public.lancamentos (venda_id);

-- ---------------------------------------------------------------------
-- Alertas de remoção do site
-- ---------------------------------------------------------------------
create table public.alertas_site (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id),
  venda_id uuid references public.vendas (id),
  status text not null default 'pendente' check (status in ('pendente', 'adiado', 'removido', 'cancelado')),
  adiado_ate timestamptz,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid
);
create unique index alertas_site_um_aberto_idx on public.alertas_site (produto_id)
  where status in ('pendente', 'adiado');

-- ---------------------------------------------------------------------
-- Importações
-- ---------------------------------------------------------------------
create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo text,
  resumo jsonb,
  usuario_id uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
