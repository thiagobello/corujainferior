# Coruja Inferior

Estoque, vendas e financeiro das marcas Coruja Sports e Arquibancada Inferior. Um único código Expo (React Native) gera o **site responsivo** e os **apps iOS/Android**. O banco é **Supabase** (Postgres + login + fotos).

## Configuração (uma vez)

1. **Crie um projeto** em [supabase.com](https://supabase.com) (o plano gratuito atende).
2. **Crie o banco:** no painel do Supabase, abra **SQL Editor** e execute, nesta ordem, o conteúdo de:
   - `supabase/migrations/20261013000001_schema.sql`
   - `supabase/migrations/20261013000002_funcoes.sql`
   - `supabase/migrations/20261013000003_storage.sql`
   - `supabase/migrations/20261013000004_categorias_repasses.sql`
   - `supabase/migrations/20261013000005_repasse_arquibancada.sql`
   - `supabase/migrations/20261013000006_codigo_manual.sql`
   - `supabase/migrations/20261013000007_grupos.sql`
   - `supabase/migrations/20261013000008_gerenciar_categorias.sql`
   - `supabase/migrations/20261013000009_venda_avulsa.sql`
   - `supabase/migrations/20261013000010_recebimento_dia_util.sql`
   - `supabase/migrations/20261013000011_orcamentos.sql`
   - `supabase/migrations/20261013000012_orcamento_pecas.sql`
   - `supabase/migrations/20261014000013_sugerir_modelos.sql`
   - `supabase/migrations/20261015000014_formas_site.sql` (rode **sozinha**, antes da próxima)
   - `supabase/migrations/20261015000015_venda_site.sql`
   - `supabase/migrations/20261015000016_taxas_por_canal.sql`
   - `supabase/migrations/20261020000017_forma_dinheiro.sql` (rode **sozinha**, antes da próxima)
   - `supabase/migrations/20261020000018_venda_dinheiro.sql`
   - `supabase/migrations/20261020000019_busca_estoque.sql`

   (Ou, com a [Supabase CLI](https://supabase.com/docs/guides/cli): `npx supabase link` e depois `npx supabase db push`.)
3. **Login:** em **Authentication › Sign In / Providers › Email**, decida se quer exigir confirmação de e-mail. Se mantiver ativada, cada novo usuário precisa clicar no link recebido antes de entrar.
4. **Chaves do app:** copie `.env.example` para `.env.local` e preencha com os valores de **Project Settings › API** (URL e *publishable key*).
5. **Primeiro acesso:** rode o app e crie a primeira conta. **Ela vira administradora automaticamente**; as próximas entram como vendedoras.
6. **Taxas:** em **Mais › Taxas**, cadastre os percentuais de Pix, Débito e Crédito 1x/2x/3x em cada bloco (Loja, Site Coruja, Site Arquibancada) e, nos sites, o recebimento. Eles começam em 0%.

## Rodando

```bash
npx expo start        # abre o menu: w = navegador, QR code = celular (Expo Go)
npm test              # testes do banco e dos cálculos
npm run typecheck
npx expo lint
```

Backup do banco e das fotos para o computador: preencha a senha em `.env.backup.local` (modelo em `.env.backup.example`) e rode `./scripts/backup.sh` — ou peça ao agente **coruja-backup** no Claude Code. Para rodar sozinho toda segunda às 15h: `./scripts/agendar-backup.sh` (detalhes em [docs/banco-de-dados.md](docs/banco-de-dados.md)).

Para publicar o site de graça (Cloudflare Pages ou Vercel), siga [docs/publicacao.md](docs/publicacao.md). HTTPS é obrigatório para a câmera funcionar no navegador.

## Regras importantes

- **Códigos:** no cadastro, o app sugere o próximo código livre da categoria (ex.: M1387), e você pode trocá-lo pelo código da etiqueta. O banco recusa um número que já exista na categoria, mesmo escrito de outra forma (M1386 = M01386). O código é obrigatório no cadastro. Depois de salvo, o código não muda. Produtos não são apagados, apenas arquivados, então um código usado nunca é reaproveitado.
- **Cadastro de modelo existente:** ao digitar a descrição, o app sugere modelos já cadastrados com nome parecido (ignora acentos, maiúsculas e a ordem das palavras). Tocar num deles preenche categoria, tipo, condição, pertence, valores e foto com os dados do modelo. Para cada tamanho dá para informar a quantidade (ex.: 5 no M), e cada unidade recebe um código próprio (até 50 por cadastro).
- **Status** só muda por reserva, empréstimo, venda ou cancelamento. Não dá para editar o status "na mão".
- **Venda** é uma transação única no banco (`registrar_venda`): confere se a peça está Disponível, calcula a taxa, grava os valores, divide entre as marcas, cria as parcelas, muda o status e gera o lembrete do site. Um clique duplo ou um reenvio após queda de conexão usa a mesma chave e **não duplica a venda**. A Baixa Rápida e a tela de vendas usam a mesma função.
- **Busca do estoque:** ignora acentos e maiúsculas, acha trechos em qualquer posição e, com várias palavras, mostra o que tem todas elas em qualquer ordem ("2009 corinthians"). Procura em descrição, código, cor, tamanho e categoria. O X dentro do campo apaga a busca.
- **Taxa:** a loja absorve. O cliente paga o valor efetivo e o líquido é `bruto − bruto × taxa%`, arredondado ao centavo. Cada venda guarda o percentual usado, então mudar a configuração não altera vendas antigas.
- **Divisão:** Coruja ou Arquibancada ficam com 100% do líquido. Em "Ambos" o líquido é dividido em 50/50, e o centavo ímpar fica com a Coruja, de modo que a soma bate exatamente. Em "Concessão", o valor devido ao proprietário segue o acordo (percentual do líquido ou valor fixo) e o restante vai para a marca configurada.
- **Repasse à Arquibancada:** todo o dinheiro entra na maquininha da Coruja. A parte da Arquibancada fica pendente: 100% do líquido nas peças "Arquibancada Inferior", 50% nas peças "Ambos" e a comissão de concessão quando destinada a ela. Esses valores aparecem em **Mais › Repasses**, agrupados por semana (segunda a domingo). Um administrador dá baixa quando faz o repasse. Se uma venda já repassada for cancelada, o valor volta como estorno negativo no repasse seguinte.
- **Categorias:** cada categoria tem uma sigla de 1 a 3 letras, usada nos códigos (Masculino → M001). Administradores gerenciam as categorias em **Mais › Categorias**: criar, renomear, arquivar/reativar e excluir. A sigla não muda depois de criada, porque já está nas etiquetas. Só categorias que nunca tiveram produto podem ser excluídas. As demais são arquivadas: saem do cadastro, mas os produtos continuam no estoque.
- **Venda avulsa:** itens sem cadastro (ex.: isqueiros) são lançados na hora da venda, em **Mais › Venda avulsa** ou pelo botão "Item sem cadastro" na Baixa Rápida e na Nova venda. Informe descrição, quantidade, valor e a quem pertence. Taxa, divisão entre marcas, repasse e painel seguem as mesmas regras dos produtos. Esses itens não mexem no estoque. Os últimos itens vendidos aparecem como atalho no aparelho.
- **Orçamentos (reformas):** na aba **Orçamentos** do menu inferior, informe o cliente e o telefone ou Instagram, e adicione uma ou mais **camisas**. Cada camisa tem nome (ex.: "Corinthians 2009"), fotos, serviços separados em **Frente**, **Verso** e **Mangas e outros**, e valor próprio. O orçamento mostra o valor de cada camisa e o total. Serviços "a partir de" (Estampas/Personalizações) têm o valor digitado na hora, com um campo para descrever o que será feito. Todo orçamento nasce como **Pendente**, e o status muda no detalhe. O botão **Gerar PDF** cria o orçamento com a logo, um bloco por camisa (sem fotos; elas ficam só no app) e as observações da tabela: no celular abre o compartilhar, no navegador abre a impressão ("Salvar como PDF"). Em **Mais › Serviços e status** dá para editar serviços (posição, variação, valor) e ativar ou criar status. Para trocar a logo, substitua `assets/images/logo-marca.jpg` e regenere `src/lib/logo-marca.ts`.
- **Dinheiro:** forma de pagamento só nas vendas da loja, sem taxa (o líquido é o valor da venda; não aparece em Mais › Taxas). Divisão entre marcas, concessão e repasse seguem as regras de sempre. Conta como recebido na hora.
- **Recebimento:** Pix e Dinheiro contam como recebidos na hora. Débito e crédito (1x, 2x ou 3x) caem de uma vez no próximo dia útil (segunda a sexta; feriados não são considerados) e contam como recebidos nessa data, sem parcelas futuras. "Pagamento pendente" só conta depois de marcado como recebido em **Mais › A receber**.

## Estrutura

```
supabase/migrations/   schema, funções (cadastro, venda, reserva, repasse, painel) e storage
src/app/               telas (Expo Router)
src/components/        componentes de interface e formulários
src/lib/               acesso a dados e cálculos monetários
tests/                 testes com Postgres embutido (PGlite)
docs/                  documentação completa (arquitetura, regras, banco, telas, decisões)
.claude/agents/        agente especialista do sistema (coruja-especialista)
```

Para qualquer mudança, comece por [docs/README.md](docs/README.md). No Claude Code, use o agente **coruja-especialista**, que já carrega todo esse contexto.

## Pendente

- **Escanear Tag (OCR):** a tela já localiza o produto pelo código digitado (a alternativa manual). Falta conectar a leitura do código manuscrito pela câmera.
