# Banco de dados (Supabase / Postgres)

Todo o schema está em `supabase/migrations/`, aplicado **em ordem**. As migrations são incrementais: uma função pode ser redefinida por uma migration posterior — **a versão vigente é sempre a da última migration que a define** (indicada abaixo).

## Migrations

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `20261013000001_schema.sql` | Tipos, perfis/usuários, prefixos (categorias), consignantes, produtos, movimentações, reservas, taxas, vendas, itens, pagamentos, lançamentos, alertas do site; gatilhos de guarda e histórico; `gerar_codigo` |
| 2 | `20261013000002_funcoes.sql` | Divisão entre marcas, núcleo da venda, venda/cancelamento, pagamentos, cadastro, reservas, alertas, taxas, usuários, views `produtos_lista`/`pagamentos_situacao`, resumos, RLS e grants |
| 3 | `20261013000003_storage.sql` | Bucket público `produtos` (fotos, 5 MB, jpeg/png/webp) e políticas |
| 4 | `20261013000004_categorias_repasses.sql` | Siglas livres (`decompor_codigo` genérico), `criar_categoria`, tabela `repasses`, view `repasse_pendente`, `registrar_repasse`/`desfazer_repasse` |
| 5 | `20261013000005_repasse_arquibancada.sql` | Repasse passa a incluir tudo que é da Arquibancada (não só "Ambos") |
| 6 | `20261013000006_codigo_manual.sql` | Código informado no cadastro: `normalizar_codigo`, `verificar_codigo`, `sugerir_codigos`, novo `criar_produtos(…, p_codigos)`, índice único (prefixo, número); remove importação de planilha |
| 7 | `20261013000007_grupos.sql` | Coluna `grupo` em `produtos_lista`, `ordem_tamanho`, `listar_grupos` (estoque agrupado) |
| 8 | `20261013000008_gerenciar_categorias.sql` | `prefixos.arquivada`, view `categorias_resumo`, renomear/arquivar/excluir categoria, cadastro bloqueado em categoria arquivada, criar categoria só admin |
| 9 | `20261013000009_venda_avulsa.sql` | Itens sem produto (`descricao`, `quantidade`), `_inserir_venda`/`registrar_venda` com avulsos, origem `avulsa`, `repasse_pendente` e `resumo_financeiro` atualizados |
| 10 | `20261013000010_recebimento_dia_util.sql` | `proximo_dia_util`, `_criar_pagamentos`, cartão recebe no próximo dia útil (sem parcelas) |
| 11 | `20261013000011_orcamentos.sql` | `servicos`, `orcamento_status`, `orcamentos`, `orcamento_itens`, `orcamento_historico` e funções |
| 12 | `20261013000012_orcamento_pecas.sql` | `servicos.grupo` (frente/verso/outros), barra separada, `orcamento_pecas` (camisas), novo `salvar_orcamento(…, p_pecas)` e `salvar_servico(…, p_grupo)` |
| 13 | `20261014000013_sugerir_modelos.sql` | `sem_acento`, `sugerir_modelos` (autocomplete da descrição) |
| 14 | `20261015000014_formas_site.sql` | Formas `site_coruja` e `site_arquibancada` no enum `forma_pagamento`. **Sozinha de propósito:** valor novo de enum não pode ser usado na mesma transação em que foi criado — rode antes da 15 |
| 16 | `20261015000016_taxas_por_canal.sql` | Taxas por **(canal, forma)**: `taxas.canal` + PK `(canal, forma)`, 5 formas por site (semeadas da taxa única da 15), `taxas_historico.canal`; remove o gatilho `vendas_definir_canal`; `registrar_venda(…, p_canal)`, `_inserir_venda(…, p_canal)`, `atualizar_taxa(forma, percentual, canal)`, `definir_liquidacao_taxa(canal, forma, liquidacao)`; formas `site_*` viram legado |
| 17 | `20261020000017_forma_dinheiro.sql` | Forma `dinheiro` no enum `forma_pagamento`. **Sozinha de propósito** (como a 14) — rode antes da 18 |
| 18 | `20261020000018_venda_dinheiro.sql` | Dinheiro: check `taxas_sem_dinheiro` (não existe linha de taxa), `atualizar_taxa` recusa Dinheiro, `registrar_venda` aceita `dinheiro` só no canal loja e força taxa 0 (recebido na hora) |
| 19 | `20261020000019_busca_estoque.sql` | Busca ampla: `casa_busca`, `listar_unidades` (unidades filtradas, base da lista e da exportação), `listar_grupos` sobre `listar_unidades` |
| 15 | `20261015000015_venda_site.sql` | Venda pelo site: taxas dos sites, `vendas.canal` + gatilho `vendas_definir_canal`, `definir_liquidacao_taxa`, `pagamentos_situacao` com `canal`/`recebedor`, `repasse_pendente` nos dois sentidos, `resumo_financeiro` com `por_canal` e recebimentos por recebedor |

### Como criar uma migration nova

1. Crie `supabase/migrations/AAAAMMDDNNNNNN_descricao.sql` com número maior que o último. **Nunca edite uma migration já aplicada** no Supabase do cliente.
2. Para mudar função: `create or replace function` com **mesma assinatura e mesmos nomes de parâmetros**. Mudou nome/tipo de parâmetro → `drop function public.x(tipos…);` e `create function` (e refaça `revoke`/`grant`).
3. Para view: `create or replace view` só aceita **acrescentar colunas no fim** (sem renomear/remover).
4. Toda função exposta ao app: `revoke execute … from public, anon;` e `grant execute … to authenticated;`. Funções internas (prefixo `_`): revogue também de `authenticated`.
5. Tabela nova: `enable row level security` + política `leitura` (`using (public.papel_atual() is not null)`); escrita via funções `security definer`.
6. Adicione testes em `tests/db.test.mjs` e rode `npm test`.
7. Atualize a lista do `README.md` (passo "Crie o banco") e este documento.

### Backup local

`scripts/backup.sh` (usa `pg_dump`/`psql` do Postgres.app). Lê `SUPABASE_DB_URL` de `.env.backup.local` (Session pooler, porta 5432, com a senha do banco; modelo em `.env.backup.example`, arquivo ignorado pelo git) e `EXPO_PUBLIC_SUPABASE_URL` do `.env.local`. Gera em `~/Backups/coruja/AAAA-MM-DD_HHMMSS/` (ou `BACKUP_DIR`), com permissão só do usuário: `banco.dump` (schema `public`, para `pg_restore`), `banco.sql`, `usuarios.sql` (`auth.users` e `auth.identities`), `fotos/` (bucket `produtos`, baixado pela URL pública) e `RESTAURAR.txt`. Confere a conexão antes, troca a porta 6543 (Transaction pooler) por 5432 e remove a pasta se falhar no meio. **Mantém só o último backup:** depois de um backup completo (todas as fotos baixadas, dump com as tabelas principais e `usuarios.sql` com `COPY auth.users`), apaga as pastas anteriores no formato de data dentro da pasta de backups; se algo falhar, os anteriores são mantidos (saída 2 = fotos com falha, 3 = dump incompleto). No Claude Code, o agente **`coruja-backup`** (`.claude/agents/coruja-backup.md`) executa e valida a rotina.

**Agendamento semanal (toda segunda às 15h):** `scripts/agendar-backup.sh` instala um LaunchAgent do macOS (`~/Library/LaunchAgents/br.com.corujainferior.backup.plist`) que roda `scripts/backup-agendado.sh` (backup + log em `~/Library/Logs/coruja-backup.log` + notificação do Mac). Como o macOS bloqueia tarefas agendadas na pasta Documentos, a instalação copia os scripts, o `.env.backup.local` e a URL do `.env.local` para `~/Library/Application Support/CorujaBackup` (permissão só do usuário). **Mudou a senha ou o script → rode `./scripts/agendar-backup.sh` de novo.** Comandos: `agendar-backup.sh agora` (teste), `status`, `remover`. Mac dormindo no horário → roda ao acordar; desligado → a semana é pulada.

**Restauração (ordem testada):** 1) `usuarios.sql`; 2) `pg_restore --no-owner --no-privileges banco.dump` (o aviso `schema "public" already exists` é normal); 3) recriar o gatilho `on_auth_user_created` em `auth.users` (não vem no dump do `public`); 4) projeto novo: migration de storage e reenvio das fotos. Restaurar o banco antes dos usuários deixa `perfis` sem a chave estrangeira.

### Limpar os dados (zerar o sistema)

`supabase/limpar-dados.sql` (**não** é migration; rodar manualmente no SQL Editor). Apaga produtos, histórico, reservas, vendas, recebimentos, lançamentos, repasses, alertas e orçamentos, reinicia a numeração dos orçamentos e os contadores de código das categorias. Mantém usuários, categorias, taxas, serviços, status de orçamento e consignantes (opcionais comentados no arquivo). Fotos: Storage › bucket `produtos` › **Empty bucket** (o Supabase bloqueia apagar `storage.objects` por SQL). Ao criar tabela nova de dados, inclua-a na lista do `truncate`.

## Tipos (enums)

| Tipo | Valores |
|---|---|
| `tipo_produto` | Réplica, Original, Própria |
| `condicao_produto` | Nova, Usada |
| `pertence_produto` | Coruja Sports, Arquibancada Inferior, Concessão, Ambos |
| `status_produto` | Disponível, Vendida, Reservada, Emprestada |
| `forma_pagamento` | pix, dinheiro (sem taxa, só loja; migration 17/18), debito, credito_1x, credito_2x, credito_3x; legado: site_coruja, site_arquibancada (taxa única por site, migration 15), outro |
| `papel_usuario` | admin, vendedor |

## Tabelas

### Usuários e configuração
- **`perfis`** — `id` (= `auth.users.id`), `nome`, `email`, `papel`, `ativo`, `criado_em`. Criado pelo gatilho `on_auth_user_created`.
- **`prefixos`** (categorias) — `prefixo` (PK, 1–3 letras), `descricao` (único, sem diferenciar maiúsculas), `proximo` (contador, só cresce), `digitos` (padrão 3), `arquivada`.
- **`consignantes`** — `nome`, `contato`, `tipo_acordo` (`percentual`|`fixo`), `valor_acordo` (≤100 se percentual), `marca_restante` (`coruja`|`arquibancada`|`ambos`), `observacoes`.
- **`taxas`** — PK `(canal, forma)`; `canal` (`loja`|`site_coruja`|`site_arquibancada`), `forma`, `rotulo`, `percentual` numeric(7,4), `parcelas`, `liquidacao` (`imediata`|`proximo_dia_util`|`mensal`), `ordem`. Loja: Pix=imediata; débito/crédito=proximo_dia_util, parcelas 1 (mais a linha legada `outro`). Cada site: Pix, Débito, Crédito 1x/2x/3x, começando em proximo_dia_util; o admin troca por linha para imediata (`definir_liquidacao_taxa`). (migration 16) **Dinheiro não tem linha** (check `taxas_sem_dinheiro`, migration 18): a taxa 0 é forçada em `registrar_venda`.
- **`taxas_historico`** — mudanças de percentual (`canal`, forma, anterior, novo, usuário, data).

### Estoque
- **`produtos`** — uma linha por unidade física.
  - Identificação: `id`, `codigo` (único, `^[A-Z]{1,3}[0-9]+$`), `prefixo` → `prefixos`, `descricao`, `tamanho`, `cor`.
  - Classificação: `tipo`, `condicao`, `pertence`, `consignante_id`, `acordo_tipo`/`acordo_valor` (acordo próprio da peça, sobrepõe o do consignante).
  - Valores: `custo` (nulo = não informado), `preco_venda`, `lucro_estimado` (gerado: preço − custo).
  - Estado: `status`, `cadastrado_site` (null = não verificado), `arquivado`, `foto_path`, `observacoes`.
  - Legado da importação removida: `codigo_original`, `dados_origem`, `import_chave` (não usar em código novo).
  - Índices: único `codigo`; único `(prefixo, número do código)` (`produtos_prefixo_numero_idx`).
- **`movimentacoes`** — histórico por produto: `tipo` (cadastro, edicao, importacao, reserva, cancelamento_reserva, emprestimo, devolucao, venda, cancelamento_venda, site_removido, site_adiado, site_pendente), `status_anterior/novo`, `detalhes` jsonb (em edição: `{campo: {de, para}}`), `observacoes`, `usuario_id`, `criado_em`.
- **`reservas`** — reservas e empréstimos: `produto_id`, `tipo` (`reserva`|`emprestimo`), `cliente`, `observacoes`, `previsao`, `inicio`, `encerrada_em/por`, `obs_encerramento`. Índice único: uma ativa por produto.
- **`alertas_site`** — `produto_id`, `venda_id`, `status` (pendente, adiado, removido, cancelado), `adiado_ate`, `resolvido_em/por`. Único: um aberto por produto.

### Vendas e financeiro
- **`vendas`** — `idempotency_key` (único), `data_venda`, `forma`, `forma_original` (legado), `taxa_percentual`, totais `valor_bruto`/`taxa_valor`/`valor_liquido`, `cliente`, `observacoes`, `origem` (venda, baixa_rapida, avulsa, importacao), `status` (concluida|cancelada), `cancelada_em/por`, `motivo_cancelamento`, `usuario_id`, `canal` (`loja`|`site_coruja`|`site_arquibancada`; informado em `registrar_venda`, separado da `forma`). `taxa_percentual` é o da combinação canal + forma no momento da venda.
- **`venda_itens`** — `venda_id`, `produto_id` (**nulo = item avulso**), `descricao` + `quantidade` (avulso), fotografia do produto (`preco_padrao`, `custo`, `pertence`, `consignante_id`), `valor_bruto` (total do item), `desconto` (gerado), `taxa_percentual`, `taxa_valor`, `valor_liquido`, `lucro_bruto`, `resultado`, `ativo`. Checks: líquido = bruto − taxa; resultado = lucro − taxa; produto ou descrição. Índice único parcial: produto em um item ativo.
- **`pagamentos`** (recebimentos) — `venda_id`, `parcela`/`total_parcelas` (hoje sempre 1/1), valores, `vencimento`, `liquidacao` (`automatica` = conta como recebido no vencimento; `manual` = só quando marcado), `status` (pendente, recebido, cancelado), `recebido_em`.
- **`lancamentos`** — divisão do líquido: `venda_id`, `venda_item_id`, `beneficiario` (coruja, arquibancada, consignante), `consignante_id`, `valor`, `descricao`, `ativo`, `repasse_id` (acertado num repasse — parte da Arquibancada nas vendas da loja/site Coruja, ou parte da Coruja nas vendas do site Arquibancada), `estorno_repasse_id` (estorno compensado).
- **`repasses`** — `periodo_inicio/fim`, `valor` (com sinal: positivo = a Coruja pagou a Arquibancada; negativo = a Arquibancada pagou a Coruja), `pago_em`, `observacoes`, `status` (pago|desfeito), `usuario_id`, `desfeito_em/por`.

### Orçamentos
- **`servicos`** — catálogo: `nome`, `detalhe` (variação: cor única, colorido, par), `valor`, `a_partir_de`, `grupo` (frente|verso|outros), `ordem`, `ativo`.
- **`orcamento_status`** — `codigo` (PK, slug), `rotulo`, `ordem`, `ativo`, `sistema` (pendente).
- **`orcamentos`** — `numero` (identity, exibido com 4 dígitos), `cliente_nome`, `contato`, `observacoes` (internas), `status` → `orcamento_status`, `total`, `criado_por`, datas. `fotos` é legado (zerado; fotos ficam nas peças).
- **`orcamento_pecas`** (camisas) — `orcamento_id`, `nome`, `fotos` text[], `subtotal`, `ordem`.
- **`orcamento_itens`** — `orcamento_id`, `peca_id`, `servico_id` (nulo = personalizado), `descricao` (com posição), `quantidade`, `valor_unitario`, `total` (gerado), `ordem`.
- **`orcamento_historico`** — mudanças de status.

## Views (todas `security_invoker`, respeitam RLS)

- **`produtos_lista`** — produtos + `numero` (do código), `categoria`, `consignante_nome`, venda ativa (`venda_id`, `data_venda`, `forma_venda`, `valor_vendido`, `taxa_venda_*`), reserva ativa (`reserva_*`) e `grupo` (= `lower(trim(descricao))`).
- **`pagamentos_situacao`** — pagamentos não cancelados de vendas concluídas + `recebido` (marcado, ou automático com vencimento ≤ hoje), `data_recebimento`, `canal` e `recebedor` (`arquibancada` no site dela, senão `coruja`). (migration 15)
- **`repasse_pendente`** — o que falta acertar entre as marcas, com sinal: loja/site Coruja → lançamentos da Arquibancada (venda **positiva**, estorno negativo); site Arquibancada → só lançamentos da Coruja (venda **negativa**, estorno positivo; o do proprietário fica fora). Colunas: `tipo` (venda|estorno), `data_ref`, `valor`, `descricao` (do produto ou do item avulso), `codigo`, `pertence`, `canal`, `beneficiario`. A soma é o saldo (negativo = a Arquibancada deve à Coruja). (migration 15)
- **`categorias_resumo`** — prefixos + contagem de produtos e disponíveis.

## Funções

`D` = `security definer` (ignora RLS, valida o usuário dentro). `I` = invoker. Migration = onde está a versão vigente.

### Segurança e utilitários
| Função | Tipo | Descrição | Migration |
|---|---|---|---|
| `papel_atual()` | D | Papel do usuário logado se ativo, senão null (usada nas políticas) | 1 |
| `exigir_usuario()` / `exigir_admin()` | D | Lançam erro 42501 se não logado/ativo ou não admin | 1 |
| `on_auth_user_created()` | gatilho | Cria `perfis`; primeiro usuário = admin | 1 |
| `decompor_codigo(codigo)` → (prefixo, numero) | I | `AI012` → (`AI`, 12) | 4 |
| `normalizar_codigo(codigo)` | D | Forma canônica: `m 1386` → `M1386`, `M5` → `M005` | 6 |
| `sem_acento(t)` | I | Minúsculas sem acento (buscas) | 13 |
| `ordem_tamanho(t)` | I | Posição na ordem PP…4GG, 9…28, Único | 7 |
| `proximo_dia_util(data)` | I | Sex/sáb/dom → segunda; demais → dia seguinte | 10 |

### Produtos, códigos e categorias
| Função | Tipo | Descrição | Migration |
|---|---|---|---|
| `gerar_codigo(prefixo)` | D (interna) | Próximo código livre consumindo o contador | 1 |
| `sugerir_codigos(prefixo, qtd)` | D | Próximos códigos livres **sem consumir** (máx. 50) | 6 |
| `verificar_codigo(codigo, prefixo)` | D | `{disponivel, codigo normalizado, motivo}` | 6 |
| `criar_produtos(dados jsonb, tamanhos text[], codigos text[])` | D | Um produto por posição de `tamanhos` (repetir tamanho = várias unidades); código vazio = gera; trava a categoria; atualiza contador | 6 |
| `sugerir_modelos(busca, limite)` | I | Autocomplete: modelos por descrição (todas as palavras, sem acento) com unidades, disponíveis, tamanhos, `produto_base` | 13 |
| `casa_busca(texto, codigo, busca)` | I | Todas as palavras da busca no texto (sem acento, qualquer posição) ou busca = início do código | 19 |
| `listar_unidades(busca, status, prefixo, tamanho, tipo, condicao, pertence, site)` | I | Unidades de `produtos_lista` filtradas (busca em descrição, código, cor, tamanho e categoria; código normalizado `M01386` = `M1386`). Usada na exportação do estoque | 19 |
| `listar_grupos(busca, status, prefixo, tamanho, tipo, condicao, pertence, site, limite, offset)` | I | Estoque agrupado por descrição com tamanhos/quantidades e `total` para paginação; filtra por `listar_unidades` | 19 |
| `criar_categoria(descricao, prefixo)` | D admin | Valida sigla (1–3 letras) e nomes únicos | 8 |
| `renomear_categoria` / `arquivar_categoria` / `excluir_categoria` | D admin | Excluir só sem produtos | 8 |
| Gatilho `produtos_guarda` | — | Bloqueia mudar código e status fora das funções (`app.operacao`) | 1 |
| Gatilho `produtos_historico` | — | Grava cadastro/edição em `movimentacoes` | 1 |
| Gatilho `produtos_categoria_ativa` | — | Recusa cadastro em categoria arquivada | 8 |

### Reservas e site
| Função | Tipo | Descrição | Migration |
|---|---|---|---|
| `reservar_produto(produto, tipo, cliente, obs, previsao)` | D | Reserva/empréstimo de produto Disponível | 2 |
| `encerrar_reserva(reserva, obs)` | D | Cancela reserva / registra devolução | 2 |
| `resolver_alerta_site(alerta, acao, horas)` | D | `removido`, `adiar`, `pendente`; ignora alerta já concluído | 2 |

### Vendas, recebimentos e divisão
| Função | Tipo | Descrição | Migration |
|---|---|---|---|
| `registrar_venda(chave, itens jsonb, forma, data, cliente, obs, pendente, origem, canal)` | D | Entrada pública da venda. Itens: `{produto_id, valor_bruto}` ou avulso `{descricao, quantidade, valor_bruto, pertence, consignante_id}`. Origem: venda, baixa_rapida, avulsa. Forma: pix, dinheiro (só canal loja, taxa 0 forçada), debito…credito_3x. Canal: loja (padrão), site_coruja, site_arquibancada | 18 |
| `_inserir_venda(…, p_canal)` | D interna | Núcleo: idempotência, taxa da combinação canal + forma, travas, validações, itens, divisão, status, histórico, alerta, recebimentos | 16 |
| `_criar_pagamentos(venda, taxa, data, bruto, taxa_total, pendente, importacao)` | D interna | Regras de recebimento (imediata / próximo dia útil / mensal) | 10 |
| `_dividir_item` / `_lancar_marca` | D internas | Divisão do líquido entre marcas/consignante | 2 |
| `cancelar_venda(venda, motivo)` | D admin | Desfaz venda mantendo histórico | 2 |
| `marcar_pagamento(pagamento, recebido, data)` | D | Marca/desmarca recebimento | 2 |
| `atualizar_taxa(forma, percentual, canal)` | D admin | Taxa de uma combinação (canal padrão `loja`); grava histórico; recusa Dinheiro | 18 |
| `definir_usuario(usuario, papel, ativo)` | D admin | Papel e acesso | 2 |
| `resumo_estoque()` | I | Contagens por status, custo e valor potencial | 2 |
| `resumo_financeiro(inicio, fim, marca)` | I | Painel (ver regras §12); inclui `avulsos`, `por_canal`, recebimentos da Coruja (`recebido_periodo`, `a_receber`…) e da Arquibancada (`recebido_arquibancada`, `a_receber_arquibancada`) | 15 |
| `registrar_repasse(inicio, fim, pago_em, obs)` | D admin | Baixa dos pendentes do período (vendas e estornos, nos dois sentidos); total pode ser negativo | 4 |
| `definir_liquidacao_taxa(canal, forma, liquidacao)` | D admin | Recebimento de uma linha dos sites: `imediata` ou `proximo_dia_util` (só canais `site_coruja`/`site_arquibancada`) | 16 |
| `desfazer_repasse(repasse)` | D admin | Volta valores a pendente (bloqueia se houver estorno posterior) | 4 |

### Orçamentos
| Função | Tipo | Descrição | Migration |
|---|---|---|---|
| `salvar_orcamento(id, dados jsonb, pecas jsonb)` | D | Cria (status pendente + histórico) ou substitui camisas/itens; calcula subtotais e total. `pecas: [{nome, fotos[], itens:[{servico_id, descricao, quantidade, valor_unitario}]}]` | 12 |
| `alterar_status_orcamento(id, status)` | D | Só status ativo; grava histórico | 11 |
| `salvar_servico(id, nome, detalhe, valor, a_partir_de, ativo, grupo)` | D admin | Cria/edita serviço do catálogo | 12 |
| `salvar_status_orcamento(codigo, rotulo, ativo)` | D admin | Cria (código = slug do nome) ou edita; Pendente não desativa | 11 |

## Permissões (RLS)

- Todas as tabelas têm RLS. Política `leitura` (select) para `authenticated` ativo; `importacoes` não existe mais.
- **Escrita somente via funções**, exceto:
  - `produtos`: `update` direto de colunas editáveis (`descricao, tamanho, cor, tipo, condicao, pertence, consignante_id, acordo_tipo, acordo_valor, custo, preco_venda, cadastrado_site, foto_path, observacoes, arquivado`), protegido pelo gatilho de guarda.
  - `consignantes`: insert/update por usuário ativo.
- `anon` não executa nenhuma função.
- **Storage:** bucket `produtos` público para leitura; upload/atualização por usuário ativo. Caminhos: `AAAA-MM/arquivo.jpg` (produtos) e `orcamentos/AAAA-MM/arquivo.jpg`. O app envia sempre JPEG já reduzido (≤1280 px, ~200 KB); fotos antigas maiores podem ser regravadas no mesmo caminho por `scripts/recomprimir-fotos.sh`.

## Flag de sessão `app.operacao`

As funções fazem `set_config('app.operacao', 'venda' | 'reserva' | …, true)` antes de mudar `produtos.status` e limpam depois. O gatilho `produtos_guarda` só aceita mudança de status com essa flag. Ao criar uma função nova que muda status, siga o mesmo padrão.
