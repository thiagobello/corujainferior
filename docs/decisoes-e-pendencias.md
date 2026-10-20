# Decisões, legados e pendências

Registro das decisões tomadas com o dono do sistema (Thiago). Antes de mudar algo destas áreas, entenda o motivo.

## Decisões

| Data | Decisão | Motivo |
|---|---|---|
| 2026-10-13 | Expo único para web + iOS + Android; backend Supabase | Baixo custo, uso no celular da loja e no navegador |
| 2026-10-13 | Regras críticas no banco (funções `security definer`), app só faz prévia | Consistência financeira e proteção contra uso direto da API |
| 2026-10-13 | Cor principal azul; nome do app "Coruja Inferior" | Pedido do dono |
| 2026-10-13 | Categorias em dropdown mostrando só o nome; gestão em Mais › Categorias (criar, renomear, arquivar, excluir sem produtos) | Pedido do dono |
| 2026-10-13 | Menu inferior: Estoque · Baixa Rápida · Cadastrar · Orçamentos · Mais (Painel e Escanear foram para Mais) | Pedido do dono |
| 2026-10-13 | Repasse semanal à Arquibancada de **tudo** que é dela (peças Arquibancada, metade das Ambos, comissão de concessão) | Todo o dinheiro entra na maquininha da Coruja (vendas no site da Arquibancada: ver 2026-10-15) |
| 2026-10-13 | **Sem importação de planilha**; cadastro manual com código sugerido e editável | Pedido do dono (planilha antiga tinha códigos reaproveitados) |
| 2026-10-13 | Estoque sem métricas: só busca, filtros e lista agrupada por descrição | Tela mais limpa |
| 2026-10-13 | Cadastro com todos os campos obrigatórios (exceto cor e observações), incluindo foto | Pedido do dono |
| 2026-10-13 | Venda avulsa para itens sem cadastro (isqueiros), com mesmas regras de taxa/divisão | Alto giro, não compensa cadastrar unidade a unidade |
| 2026-10-13 | Cartão recebe tudo no próximo dia útil (sem parcelas futuras); Pix na hora | Forma de recebimento contratada pela loja |
| 2026-10-13 | Orçamentos de reforma com várias camisas, serviços por posição (frente/verso/outros), PDF com logo **sem fotos** | Pedido do dono |
| 2026-10-14 | Autocomplete de modelos na descrição, vínculo copia dados e foto; quantidade por tamanho com código por unidade | Agilizar reposição |
| 2026-10-14 | Bloco único "Tamanhos e códigos" (linha por tamanho com faixa de códigos editável) | Layout mais simples |
| 2026-10-14 | Uso no iPhone como atalho em tela cheia (Safari › Adicionar à Tela de Início › Abrir como App Web); `viewport-fit=cover` para o menu não ser cortado no iPhone 17 Pro | Pedido do dono |
| 2026-10-14 | PDF do orçamento na web gerado no aparelho (pdfmake) e entregue por Compartilhar/Baixar | Janela de impressão quebrava no iPhone com o site como atalho em tela cheia |
| 2026-10-15 | Backup local semanal (segunda 15h) via launchd, com notificação, mantendo só o último backup válido | Supabase gratuito não tem backup automático |
| 2026-10-14 | Revisão de todos os textos: títulos, rótulos, avisos e confirmações curtos e objetivos (guia em `docs/app.md` › Textos da interface). Telas renomeadas: Painel, A receber, Repasses, Reservas, Taxas, Serviços e status, Usuários, Venda | Interface menos poluída |
| 2026-10-15 | Fotos comprimidas no aparelho antes do envio: lado maior 1280 px, JPEG 0,7 (~200 KB em vez de 3–5 MB). Compressão no momento da escolha, não no Cadastrar | Storage gratuito (1 GB) enchendo e cadastro lento pelo upload |
| 2026-10-15 | **Venda pelo site** em toda tela de venda: canal Loja · Site Coruja · Site Arquibancada, escolhido à parte da forma de pagamento. Site Coruja = igual à loja. Site Arquibancada = dinheiro na conta dela; a parte da Coruja abate o repasse, e o saldo semanal pode ficar negativo | Pedido do dono: vendas nos sites das duas marcas |
| 2026-10-15 | Concessão vendida no site da Arquibancada: só a comissão da Coruja abate o repasse (toda, se a marca restante é Coruja; a metade, se Ambos); comissão da Arquibancada não gera repasse; **o valor do proprietário fica fora do acerto entre as marcas** | Correção do Thiago (2026-10-15): o proprietário recebe por conta própria. Substitui a primeira versão, em que o valor do proprietário também abatia o repasse |
| 2026-10-15 | Recebimento dos sites começa no **próximo dia útil** (conservador), configurável para "na hora" em Mais › Taxas; o recebido pela Arquibancada não entra no recebido/a receber da Coruja | Não inflar o caixa da Coruja nem contar como recebido antes de cair |
| 2026-10-15 | **Taxa por canal + forma** (Pix, Débito, Crédito 1x/2x/3x em cada canal; recebimento editável por linha nos sites). Canal informado em `registrar_venda`. Substitui a primeira versão (taxa única por site, canal deduzido da forma por gatilho; formas `site_*` viram legado). Migration 16 por cima da 14/15 | Pedido do Thiago (2026-10-15): os sites também cobram taxas diferentes por forma de pagamento |
| 2026-10-20 | Forma de pagamento **Dinheiro**: sem taxa (0% forçado no banco, fora de Mais › Taxas), recebido na hora, divisão/concessão/repasse pelas regras de sempre. **Só no canal Loja** (chip some nos sites; o banco recusa) — venda pelo site não é paga em espécie | Pedido do Thiago (2026-10-20). Canal restrito por decisão técnica; se um dia houver retirada paga em dinheiro de venda do site, liberar em `registrar_venda` e em `formasDoCanal` |
| 2026-10-20 | Busca do estoque ampla: sem acento/maiúsculas, trechos em qualquer posição, todas as palavras em qualquer ordem; em descrição, código, cor, tamanho e categoria. X para limpar nos campos de busca (`Campo limpar`). Feita no banco com `sem_acento` (a extensão `unaccent` não existe no PGlite dos testes); exportação usa o mesmo filtro | Pedido do Thiago (2026-10-20) |
| 2026-10-13 | Publicação recomendada: web/PWA na Cloudflare (Workers ou Pages) + Supabase gratuito | 3 iPhones + 1 tablet + navegador, custo zero (iOS nativo custaria US$ 99/ano) |

## Legados (não usar em código novo)

- `produtos.codigo_original`, `produtos.dados_origem`, `produtos.import_chave`; `vendas.forma_original`; forma `outro`; origem `importacao`; parâmetro `p_importacao` de `_inserir_venda`/`_criar_pagamentos`; tipo `importacao` em `movimentacoes` — restos da importação de planilha removida.
- `orcamentos.fotos` — zerado; fotos ficam em `orcamento_pecas.fotos`.
- Formas `site_coruja`/`site_arquibancada` no enum `forma_pagamento` (taxa única por site da migration 15; recusadas por `registrar_venda` desde a 16).
- `taxas.liquidacao = 'mensal'` e `taxas.parcelas` — suportados por `_criar_pagamentos`, mas nenhuma forma usa hoje.
- `criar_produtos` aceita código vazio (gera automaticamente), mas a interface sempre envia códigos.

## Pendências e ideias

- **Escanear Tag (OCR):** ler o código manuscrito da etiqueta pela câmera. A tela `src/app/scanner.tsx` já faz a busca manual. Falta escolher o provedor (Claude Vision ou Google Cloud Vision) e criar uma Edge Function com a chave no servidor. Regra: sempre confirmar o código lido antes de abrir; nunca vender automaticamente.
- **Publicação:** passo a passo em `publicacao.md` (`wrangler.jsonc`/`vercel.json` já configurados). Falta: manifest/ícone de PWA.
- **Exportações XLSX/CSV na web** usam download direto (`exportar.web.ts`); no iPhone em tela cheia podem precisar do mesmo tratamento do PDF (Web Share após toque).
- **Fotos antigas grandes:** as 121 fotos enviadas antes da compressão somam ~374 MB. `scripts/recomprimir-fotos.sh` (a partir do último backup) as reduz para ~34 MB e, com `--enviar` + `SUPABASE_SERVICE_ROLE_KEY` em `.env.backup.local`, regrava no mesmo caminho (banco não muda). Testado só localmente; falta o dono rodar.
- **Pré-envio da foto** assim que é escolhida (ganharia ~0,5 s no Cadastrar, mas deixa arquivos órfãos se o cadastro for abandonado). Não feito: com a compressão o envio já é curto.
- **Feriados** no cálculo do próximo dia útil (hoje só fins de semana).
- **Custo unitário** opcional na venda avulsa (hoje lucro = valor vendido).
- **Observações do PDF** configuráveis (hoje fixas em `OBSERVACOES_ORCAMENTO`).
- **Logo em alta resolução** (atual 160×140 recortada da tabela de preços).
- **Dinheiro e busca ampla — validar no Supabase real:** rodar as migrations 17 (sozinha), 18 e 19 e conferir Baixa Rápida com Dinheiro e a busca/X do Estoque; validados só por testes do banco, typecheck/lint/build.
- **Venda pelo site — validar no Supabase real:** a tela logada (Baixa Rápida com canal + forma, Repasses com saldo negativo, Taxas com três blocos) foi validada só por typecheck/lint/build e pelos testes do banco.
- Supabase ainda não conectado durante o desenvolvimento: telas logadas foram validadas por typecheck/lint/build e prévias, e as regras por testes no PGlite.

## Dados sensíveis

- `Estoque ArqCoruja.xlsx` (planilha antiga) tem nomes e telefones de clientes: **não versionar** (`*.xlsx` no `.gitignore`).
- Nunca colocar service role key, senha do banco ou chaves de OCR no app; usar Edge Functions.
