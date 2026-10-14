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
| 2026-10-13 | Repasse semanal à Arquibancada de **tudo** que é dela (peças Arquibancada, metade das Ambos, comissão de concessão) | Todo o dinheiro entra na maquininha da Coruja |
| 2026-10-13 | **Sem importação de planilha**; cadastro manual com código sugerido e editável | Pedido do dono (planilha antiga tinha códigos reaproveitados) |
| 2026-10-13 | Estoque sem métricas: só busca, filtros e lista agrupada por descrição | Tela mais limpa |
| 2026-10-13 | Cadastro com todos os campos obrigatórios (exceto cor e observações), incluindo foto | Pedido do dono |
| 2026-10-13 | Venda avulsa para itens sem cadastro (isqueiros), com mesmas regras de taxa/divisão | Alto giro, não compensa cadastrar unidade a unidade |
| 2026-10-13 | Cartão recebe tudo no próximo dia útil (sem parcelas futuras); Pix na hora | Forma de recebimento contratada pela loja |
| 2026-10-13 | Orçamentos de reforma com várias camisas, serviços por posição (frente/verso/outros), PDF com logo **sem fotos** | Pedido do dono |
| 2026-10-14 | Autocomplete de modelos na descrição, vínculo copia dados e foto; quantidade por tamanho com código por unidade | Agilizar reposição |
| 2026-10-14 | Bloco único "Tamanhos e códigos" (linha por tamanho com faixa de códigos editável) | Layout mais simples |
| 2026-10-14 | Uso no iPhone como atalho em tela cheia (Safari › Adicionar à Tela de Início › Abrir como App Web); `viewport-fit=cover` para o menu não ser cortado no iPhone 17 Pro | Pedido do dono |
| 2026-10-14 | Revisão de todos os textos: títulos, rótulos, avisos e confirmações curtos e objetivos (guia em `docs/app.md` › Textos da interface). Telas renomeadas: Painel, A receber, Repasses, Reservas, Taxas, Serviços e status, Usuários, Venda | Interface menos poluída |
| 2026-10-13 | Publicação recomendada: web/PWA na Cloudflare (Workers ou Pages) + Supabase gratuito | 3 iPhones + 1 tablet + navegador, custo zero (iOS nativo custaria US$ 99/ano) |

## Legados (não usar em código novo)

- `produtos.codigo_original`, `produtos.dados_origem`, `produtos.import_chave`; `vendas.forma_original`; forma `outro`; origem `importacao`; parâmetro `p_importacao` de `_inserir_venda`/`_criar_pagamentos`; tipo `importacao` em `movimentacoes` — restos da importação de planilha removida.
- `orcamentos.fotos` — zerado; fotos ficam em `orcamento_pecas.fotos`.
- `taxas.liquidacao = 'mensal'` e `taxas.parcelas` — suportados por `_criar_pagamentos`, mas nenhuma forma usa hoje.
- `criar_produtos` aceita código vazio (gera automaticamente), mas a interface sempre envia códigos.

## Pendências e ideias

- **Escanear Tag (OCR):** ler o código manuscrito da etiqueta pela câmera. A tela `src/app/scanner.tsx` já faz a busca manual. Falta escolher o provedor (Claude Vision ou Google Cloud Vision) e criar uma Edge Function com a chave no servidor. Regra: sempre confirmar o código lido antes de abrir; nunca vender automaticamente.
- **Publicação:** passo a passo em `publicacao.md` (`wrangler.jsonc`/`vercel.json` já configurados). Falta: manifest/ícone de PWA e backup semanal gratuito do banco (pg_dump agendado).
- **Feriados** no cálculo do próximo dia útil (hoje só fins de semana).
- **Custo unitário** opcional na venda avulsa (hoje lucro = valor vendido).
- **Observações do PDF** configuráveis (hoje fixas em `OBSERVACOES_ORCAMENTO`).
- **Logo em alta resolução** (atual 160×140 recortada da tabela de preços).
- Supabase ainda não conectado durante o desenvolvimento: telas logadas foram validadas por typecheck/lint/build e prévias, e as regras por testes no PGlite.

## Dados sensíveis

- `Estoque ArqCoruja.xlsx` (planilha antiga) tem nomes e telefones de clientes: **não versionar** (`*.xlsx` no `.gitignore`).
- Nunca colocar service role key, senha do banco ou chaves de OCR no app; usar Edge Functions.
