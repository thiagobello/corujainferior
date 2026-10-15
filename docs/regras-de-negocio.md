# Regras de negócio

Onde a regra é garantida está indicado entre colchetes. "[banco]" significa que vale mesmo se alguém chamar a API diretamente.

## 1. Usuários e permissões

- Login por e-mail e senha (Supabase Auth). **O primeiro usuário cadastrado vira `admin`**; os demais entram como `vendedor`. [banco: `on_auth_user_created`]
- Usuário inativo (`perfis.ativo = false`) não acessa nada. [banco: `papel_atual()` nas políticas]
- **Vendedor:** cadastra/edita produtos, vende, reserva/empresta, marca pagamentos, resolve alertas do site, cria orçamentos e muda status de orçamento.
- **Somente admin:** cancelar venda, alterar taxas, gerenciar usuários, gerenciar categorias (criar/renomear/arquivar/excluir), registrar/desfazer repasses, configurar serviços e status de orçamento, arquivar produto. [banco: `exigir_admin()`]
- Um admin não pode remover o próprio acesso de admin. [banco]

## 2. Produtos e estoque

- **Cada unidade física é um registro** em `produtos`, com código único escrito na etiqueta.
- Campos obrigatórios no cadastro [app]: categoria, código, descrição, tamanho, tipo (Réplica/Original/Própria), condição (Nova/Usada), pertence, custo, preço de venda e **foto**. Opcionais: cor e observações.
- **Pertence:** Coruja Sports, Arquibancada Inferior, Ambos ou Concessão. Concessão exige um **consignante** (proprietário) para vender. [banco]
- **Status:** Disponível, Vendida, Reservada, Emprestada. **Só muda por funções** (reserva, empréstimo, venda, cancelamento). Update direto de status é recusado. [banco: gatilho `produtos_guarda` + flag de sessão `app.operacao`]
- **Código não pode ser alterado** depois de salvo. [banco]
- Produtos **não são apagados**, apenas arquivados (`arquivado`), para nunca reaproveitar um código. Arquivados somem do estoque e não podem ser vendidos.
- Toda alteração gera histórico em `movimentacoes` (cadastro, edição com "de → para", reserva, venda etc.), com usuário e data. [banco: gatilho `produtos_historico`]
- Editar preço/custo de um produto vendido **não altera** a venda já gravada (os valores da venda são fotografados no item).
- **Tamanhos padrão:** adultos PP, P, M, G, GG, 2GG, 3GG, 4GG; infantis 9, 12, 16, 18, 20, 22, 24, 26, 28; Único. Tamanhos livres (EG, G1…) são aceitos.
- **Cadastro em lote:** uma descrição com vários tamanhos e **quantidade por tamanho** (ex.: 5 no M) gera um produto por unidade, cada um com código próprio (máx. 50 unidades por cadastro). A mesma foto vale para todas.
- **Autocomplete da descrição:** ao digitar (2+ letras), o app sugere modelos já cadastrados com nome parecido (ignora acentos, maiúsculas e ordem das palavras). Tocar num modelo **vincula**: copia categoria, descrição exata, cor, tipo, condição, pertence/consignante/acordo, custo, preço e **a mesma foto** (mesmo arquivo). Mudar a descrição desfaz o vínculo.
- **Agrupamento no estoque:** produtos com a **mesma descrição** (ignorando maiúsculas e espaços nas pontas) aparecem como um item só, com tamanhos e quantidades disponíveis. Um grupo de 1 unidade abre direto o produto.
- Filtros do estoque valem por unidade (o grupo mostra só as unidades filtradas).

## 3. Categorias e códigos

- Categoria = **sigla de 1 a 3 letras** + nome (ex.: `M` Masculino, `F` Feminino, `I` Infantil, `A` Agasalho, `B` Boné, `S` Shorts, `AI` Arquibancada Inferior, `SA` Ecobag/Sacola, `C` Caixa Promo). A interface mostra só o nome.
- Código = sigla + número com zeros à esquerda até 3 dígitos (`M005`, `M1387`, `AI012`).
- **Um número só existe uma vez por categoria:** `M1386`, `M01386` e `m 1386` são o mesmo código. [banco: normalização + índice único `(prefixo, número)`]
- No cadastro, o app **sugere os próximos códigos livres** da categoria (sem reservá-los) e permite trocar pelo código já escrito na etiqueta. O código digitado é conferido no banco ("Já existe: M1386 · Corinthians 1990 (G)"). O código precisa começar com a sigla da categoria escolhida.
- Depois de usar um número alto manualmente, as sugestões continuam a partir dele (contador `prefixos.proximo` só cresce). **Códigos nunca são reutilizados.**
- Categorias são gerenciadas em Mais › Categorias (admin): criar (com sugestão de sigla), renomear (só o nome; a sigla é imutável), **arquivar/reativar** (some do cadastro, produtos continuam vendáveis) e **excluir só se nunca teve produto** (libera a sigla). Cadastro em categoria arquivada é recusado. [banco]

## 4. Reservas e empréstimos

- Só produto **Disponível** pode ser reservado ou emprestado. Fica **Reservada/Emprestada** e **bloqueado para venda** até o cancelamento/devolução explícitos. [banco]
- Encerrar devolve para Disponível somente se o status ainda for o da reserva e não houver venda ativa. Registra cliente, previsão, observações e histórico.

## 5. Vendas

- Uma única função (`registrar_venda`) serve **Baixa Rápida**, **Nova venda** (vários itens) e **Venda avulsa**. As regras são idênticas em todas as telas.
- **Atômica:** valida tudo, grava venda, itens, lançamentos, recebimentos, muda status e gera alerta do site — ou nada. [banco]
- **Idempotente:** cada tentativa de venda tem uma chave (UUID). Clique duplo ou reenvio após queda de rede devolve a **mesma venda**. [banco: `vendas.idempotency_key` único]
- **Sem venda duplicada:** um produto só pode estar em um item de venda ativo; produto Vendida/Reservada/Emprestada/arquivado é recusado. [banco: trava `for update` + índice único parcial]
- **Desconto:** o valor efetivo é editável (pré-preenchido com o preço padrão); o preço do produto não muda. Mostra desconto em R$ e %.
- **Venda avulsa (sem cadastro, ex.: isqueiros):** item com descrição, quantidade, valor (unitário na tela; total gravado) e pertence. Segue as mesmas regras de taxa, divisão e repasse; **não mexe no estoque**. Pode ser misturada com produtos na mesma venda. Os últimos itens avulsos ficam como atalho **no aparelho** (localStorage).
- **Cancelamento (admin, com motivo):** produtos voltam a Disponível, itens/lançamentos ficam inativos, recebimentos cancelados, alertas do site cancelados; o histórico é mantido. Se a parte da Arquibancada já tinha sido repassada, vira **estorno** no próximo repasse.
- Data da venda é editável (padrão: hoje no fuso de São Paulo).
- **Canal da venda:** **Loja** (padrão), **Site Coruja** ou **Site Arquibancada**, escolhido em toda tela de venda (Baixa Rápida, Nova venda, Venda avulsa). Canal e forma de pagamento são escolhidos **separadamente**; a taxa vem da combinação canal + forma (§6). O canal é gravado na venda (`vendas.canal`, parâmetro `p_canal` de `registrar_venda`). [banco]
  - **Site Coruja:** o dinheiro entra na Coruja; divisão e repasse iguais aos da loja.
  - **Site Arquibancada:** o dinheiro entra na conta da Arquibancada. A divisão do líquido é a mesma (§8), mas o sentido do repasse se inverte (§9).
- Ao vender peça marcada "no site", nasce um **alerta de remoção do site**.

## 6. Taxas de pagamento

- Formas: **Pix, Débito, Crédito 1x, 2x, 3x**, em cada canal (**Loja**, **Site Coruja**, **Site Arquibancada**). **A taxa é por canal + forma** (ex.: Site Arquibancada · Crédito 3x tem percentual próprio). Configuráveis em Mais › Taxas (três blocos) e começam em 0%. `outro` e as formas `site_coruja`/`site_arquibancada` (taxa única por site, primeira versão) existem só como legado e são recusadas em vendas novas. [banco]
- A loja/marca absorve a taxa do site da mesma forma que a da maquininha (mesmas fórmulas abaixo); divisão e repasse são sempre sobre o líquido após a taxa da combinação.
- **A loja absorve a taxa:** cliente paga o valor efetivo.
  - `taxa = round(bruto × percentual / 100, 2)` (meio para longe do zero)
  - `líquido = bruto − taxa`
  - `lucro bruto = bruto − custo` (custo nulo conta como 0)
  - `resultado = bruto − custo − taxa`
- A taxa é calculada **por item**; a venda soma os itens.
- **Cada venda grava o percentual e o valor usados.** Alterar a configuração não muda vendas antigas. Mudanças de taxa ficam em `taxas_historico`.

## 7. Recebimentos

- **Pix:** recebido na hora (data da venda).
- **Débito e crédito (1x/2x/3x):** **um único recebimento no próximo dia útil** (seg→ter … sex/sáb/dom→segunda), contado como recebido nessa data (liquidação automática). **Não há parcelas futuras.** Feriados não são considerados.
- **Sites:** cada forma de cada site começa com **um recebimento no próximo dia útil** (mais conservador). O admin muda por linha para **na hora** em Mais › Taxas (coluna `taxas.liquidacao`, função `definir_liquidacao_taxa`; só os canais dos sites aceitam essa troca — a loja segue Pix na hora e cartão no próximo dia útil). [banco]
- **Quem recebe:** loja e site Coruja → Coruja; site Arquibancada → **Arquibancada** (`pagamentos_situacao.recebedor`). O que entra na conta da Arquibancada **não conta** no recebido/a receber da Coruja: aparece separado no Painel ("Com a Arquibancada (site)") e em Mais › A receber (seção "Site Arquibancada").
- **Pagamento pendente** (cliente paga depois): só conta como recebido quando alguém marca em Mais › A receber.
- O painel distingue **vendido** de **efetivamente recebido**.

## 8. Divisão do valor líquido entre marcas

Sobre o **líquido** (após a taxa), por item:

| Pertence | Divisão |
|---|---|
| Coruja Sports | 100% Coruja |
| Arquibancada Inferior | 100% Arquibancada |
| Ambos | 50/50; **centavo ímpar fica com a Coruja** (soma sempre exata) |
| Concessão | Valor devido ao proprietário pelo acordo (**% do líquido** ou **valor fixo** por peça; acordo do consignante ou acordo próprio da peça). O restante vai para a marca configurada no consignante (Coruja, Arquibancada ou Ambos 50/50). |

- Uma venda gera **um** registro de venda/item e N **lançamentos** (`lancamentos`). Relatórios somam faturamento pelos itens, nunca pelos lançamentos (sem duplicar).
- A divisão **não muda com o canal**: o lançamento diz de quem é o valor; o canal diz quem está com o dinheiro (e portanto o sentido do repasse).
- Custo, recebimento líquido e divisão ficam em campos separados.

## 9. Repasses à Arquibancada

- **Loja e site Coruja (dinheiro com a Coruja):** tudo o que é atribuído à Arquibancada fica **pendente de repasse** (valor **positivo**): 100% das peças Arquibancada, 50% das peças Ambos e a comissão de concessão destinada a ela (inclui itens avulsos).
- **Site Arquibancada (dinheiro com a Arquibancada):** a **parte da Coruja** vira valor que a Arquibancada deve à Coruja e **abate o repasse** (valor **negativo**):
  - **Ambos:** split normal (50/50 do líquido, centavo ímpar para a Coruja); a parte da Coruja abate o repasse.
  - **100% Coruja:** todo o líquido abate o repasse.
  - **100% Arquibancada:** não gera repasse.
  - **Concessão:** só a comissão da Coruja abate o repasse (toda a comissão se `marca_restante` = coruja; a metade da Coruja se = ambos). A comissão da Arquibancada não gera repasse (o dinheiro já está com ela). **O valor do proprietário fica fora do acerto entre as marcas**: ele recebe por conta própria.
  - Itens avulsos seguem a mesma regra pelo "pertence" do item.
- Tela Mais › Repasses: pendências **agrupadas por semana (segunda a domingo)**, com o **saldo** (Coruja deve − Arquibancada deve). Itens do site aparecem com a etiqueta do canal ("Site Arquibancada" / "Site Coruja") e a parte ("parte da Coruja"). Saldo negativo aparece como **"Arquibancada deve à Coruja"**. Admin dá baixa por semana ou "em tudo", com data e observação; o repasse grava o total com sinal (negativo = a Arquibancada pagou a Coruja) e vincula os lançamentos. [banco: view `repasse_pendente`]
- Venda cancelada **depois** do repasse vira **estorno com o sinal invertido** no repasse seguinte (loja/site Coruja: negativo; site Arquibancada: positivo, a Coruja devolve). Venda cancelada **antes** simplesmente sai da lista.
- Desfazer repasse (admin) devolve os valores para pendente; é recusado se algum valor dele já foi estornado em repasse posterior (desfaça o posterior antes).

## 10. Catálogo do site

- Campo "Cadastrado no site": Sim / Não / Não verificado.
- Venda de peça "Sim" cria alerta **pendente**. O popup aparece em qualquer tela, sobrevive a fechar/recarregar, com ações: **já removi** (marca o produto como fora do site), **adiar 24 h**, **manter pendente** (fecha agora, volta depois). Alertas concluídos não se repetem. Lista completa em Mais › Remover do site.

## 11. Orçamentos de reforma

- Cliente (nome obrigatório), contato (telefone ou @instagram) e **uma ou mais camisas**. Cada camisa: nome (ex.: "Corinthians 2009"), até 4 fotos (**só no app, não vão para o PDF**), serviços e itens personalizados, com **valor da camisa**; o orçamento tem **valor total**.
- **Serviços (catálogo editável)** separados por posição:
  - **Frente:** Limpeza/Remoção de patrocínios R$40, Escudo R$45, Logo R$30, Peito R$30, Omoplatas (par) R$30, Master frontal cor única R$30 / colorido R$45, Barra R$30.
  - **Verso:** Limpeza/Remoção de patrocínios R$40, Nome + número R$40, Master costa cor única R$30 / colorido R$45, Barra R$30.
  - **Mangas e outros:** Mangas (par) R$40, Patch R$35, Estampas/Personalizações **a partir de R$40**.
- Serviço "a partir de": o valor é **digitado** no orçamento (aviso se abaixo do mínimo) e há campo "o que será feito". Serviços fixos têm quantidade.
- A descrição gravada inclui a posição: "Escudo (frente)", "Master costa – colorido (verso)".
- **Todo orçamento nasce Pendente.** Status configuráveis: Pendente (padrão, não desativável), Aprovado, Recusado (ativos); A fazer, Lavagem, Aguardando material, Pronta para retirada (cadastrados, inativos até ativar); novos status podem ser criados. Toda mudança fica no histórico.
- **PDF A4** com a logo, número e data, cliente/contato, um bloco por camisa (serviços + valor da camisa), valor total e as observações fixas:
  - Nem sempre é possível a remoção de todas as manchas.
  - Tempo médio para conclusão – 20 dias úteis.
  - Formas de pagamento: Pix e Cartão de Crédito – até 3x sem juros.
- Entrega do PDF: no app nativo abre o compartilhar; na web (inclusive atalho no iPhone) o PDF é gerado no aparelho e a pessoa toca em **Compartilhar** (WhatsApp, Arquivos…) ou **Baixar**. Editar o orçamento invalida o PDF gerado antes.
- Alterar valor de serviço no catálogo não muda orçamentos já criados.

## 12. Painel financeiro (Mais › Painel)

Filtro por período e marca: quantidade de vendas e itens, faturamento bruto (com descontos e quanto veio de itens sem cadastro), taxas, líquido, custo dos vendidos (aviso de itens sem custo), lucro bruto, resultado após taxas, divisão por marca, vendido × recebido, a receber, pendências manuais, **vendas por canal** (Loja × Site Coruja × Site Arquibancada; a soma dos canais é o faturamento, sem duplicar), vendas por forma de pagamento, mais vendidos (soma quantidades), reservas/empréstimos ativos, alertas do site e saldo de repasse ("A repassar à Arquibancada" ou "Arquibancada deve à Coruja"). Com filtro de marca, os totais consideram só itens que geraram valor para a marca; recebimentos não filtram por marca. **Recebido/a receber são da Coruja**; o que entrou na conta da Arquibancada (site dela) aparece à parte.

## 13. Exportações

Estoque (uma linha por unidade, com filtros atuais; XLSX ou CSV com `;` e BOM), vendas do período, painel e repasses pendentes. Web baixa o arquivo; celular abre o compartilhar.
