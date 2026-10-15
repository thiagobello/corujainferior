# Arquitetura

## Tecnologias

| Camada | Tecnologia | Observações |
|---|---|---|
| App (web + iOS + Android) | **Expo SDK 57**, React Native 0.86, React 19.2, TypeScript 6 | `web.output: "single"` (SPA). React Compiler ligado (`experiments.reactCompiler`). |
| Navegação | **Expo Router** (rotas em `src/app/`) | `typedRoutes` ligado: rotas novas só tipam depois de rodar `npx expo start` uma vez. |
| Backend | **Supabase**: Postgres, Auth (e-mail/senha), Storage (bucket `produtos`) | Plano gratuito. Cliente `@supabase/supabase-js`. |
| Sessão | `expo-sqlite/localStorage` no celular; `window.localStorage` na web | Arquivos `src/lib/armazenamento.ts` / `.web.ts`. |
| Fotos | `expo-image-picker` (câmera/galeria), `expo-image-manipulator` (compressão no celular), `expo-image` (exibição) | Toda foto é reduzida ao ser escolhida (lado maior 1280 px, JPEG 0,7; ~200 KB) e enviada por `src/lib/fotos.ts` ao bucket `produtos`. Na web a compressão usa canvas (`comprimir-foto.web.ts`), não o manipulator. |
| PDF (orçamentos) | Celular: `expo-print` (HTML de `orcamento-html.ts`) + `expo-sharing`. Web: **pdfmake 0.3** gera o arquivo no aparelho (`orcamento-pdfmake.ts`, carregado sob demanda) + Web Share (`navigator.share`) ou download | Na web não usar `window.open`/`print()`: falham no iPhone com o site como atalho em tela cheia. |
| Exportação XLSX/CSV | SheetJS (`xlsx` 0.20.3 via CDN oficial) | `src/lib/exportar*.ts` (download na web, compartilhar no celular). |
| IDs | `expo-crypto` (`randomUUID`) | Usado na chave de idempotência das vendas. |
| Ícones | `@expo/vector-icons` (Ionicons) | |
| Testes | `node --test` + **PGlite** (Postgres em WASM) | `tests/db.test.mjs`, `tests/dinheiro.test.mjs`. |

Node é instalado via **nvm** (`~/.nvm`); em scripts, carregue com `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`.

## Estrutura de pastas

```
supabase/migrations/      SQL versionado (aplicar em ordem). Nunca editar migration já aplicada.
src/app/                  Telas (Expo Router). Cada arquivo = rota; _layout.tsx = navegador.
  (tabs)/                 Menu inferior: Estoque, Baixa Rápida, Cadastrar, Orçamentos, Mais
  config/                 Configurações (categorias, taxas, concessão, usuários, orçamentos)
  produto/ venda/ orcamentos/   Rotas de detalhe/edição
src/components/           Componentes de interface e formulários (sem rotas)
src/lib/                  Acesso a dados (api.ts), regras de cálculo, utilitários, tipos
tests/                    Testes de banco (PGlite) e de cálculo
assets/images/            Ícones e logo da marca (logo-marca.jpg)
scripts/backup.sh         Backup local do banco e das fotos (Postgres.app)
scripts/recomprimir-fotos.sh  Recomprime fotos antigas a partir do backup (simula; --enviar regrava no bucket)
public/index.html         HTML da web (viewport-fit=cover para a área segura do iPhone em tela cheia)
wrangler.jsonc            Publicação no Cloudflare Workers (SPA a partir de dist/)
vercel.json               Publicação na Vercel
docs/                     Esta documentação
.claude/agents/           Agentes: coruja-especialista (sistema) e coruja-backup (backup)
```

Arquivos com sufixo `.web.ts` substituem o equivalente nativo na web (resolução do Metro). Ex.: `exportar.ts` × `exportar.web.ts`, `orcamento-pdf.ts` × `orcamento-pdf.web.ts`, `armazenamento.ts` × `armazenamento.web.ts`.

## Comandos

```bash
npx expo start                 # servidor de desenvolvimento (w = navegador)
npm test                       # todas as migrations + regras de negócio no PGlite
npx tsc --noEmit               # typecheck (também: npm run typecheck)
npx expo lint                  # ESLint (eslint-config-expo, inclui regras do React Compiler)
npx expo install <pacote>      # SEMPRE para dependências (resolve versão compatível com o SDK)
npx expo export --platform web # build da web em dist/
npx expo export --platform ios # confere se o bundle nativo compila
```

**Antes de concluir qualquer mudança:** `npx tsc --noEmit`, `npx expo lint`, `npm test` e, se mexeu em telas, `npx expo export --platform web`.

## Ambiente

`.env.local` (não versionado; modelo em `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Sem essas variáveis o app mostra "Configuração pendente". Variáveis `EXPO_PUBLIC_*` são embutidas no build: ao mudar, rode o export com `--clear`. Nunca coloque a service role/secret key no app.

## Testes

- `tests/db.test.mjs` cria um PGlite, simula o Supabase (roles `anon`/`authenticated`, schema `auth`, `auth.uid()` lendo `request.jwt.claim.sub`), aplica **todas** as migrations em ordem (exceto `*storage*`) e testa as regras. Dois usuários: `ADMIN` (primeiro, vira admin) e `VEND` (vendedor). Use `como(uid)` para trocar de usuário.
- Helpers: `produto(dados, tamanhos)` → `criar_produtos`; `vender(itens, forma, {data, pendente, chave})` → `registrar_venda`; `lanc(vendaId)` → soma de lançamentos por beneficiário.
- `tests/dinheiro.test.mjs` garante que `src/lib/dinheiro.ts` arredonda igual ao banco.
- **Toda regra nova no banco precisa de teste aqui.** Testes que dependem de datas usam datas fixas ou a data atual do banco.

## Publicação

Passo a passo completo em [publicacao.md](publicacao.md). Resumo: Cloudflare (Workers ou Pages) com build `npx expo export --platform web`, saída `dist` e variáveis de build `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `wrangler.jsonc` (Workers, `not_found_handling: single-page-application`), `.node-version` (Node 22) e `vercel.json` (Vercel) garantem que toda rota abra o `index.html`. Supabase: ajustar Site URL e Redirect URLs para o domínio publicado.

## Convenções de código

- **Português** em nomes de variáveis, funções, colunas e textos da interface (`produto`, `registrarVenda`, `valor_bruto`). Mantenha o padrão.
- Comentários explicam o **porquê** (regra de negócio), não o óbvio. Densidade de comentários parecida com o código existente.
- Regras críticas ficam no **banco** (funções). O app só faz prévia de cálculos e chama RPCs finas em `src/lib/api.ts`.
- Componentes de UI reutilizáveis em `src/components/ui.tsx` (`Tela`, `Cartao`, `T`, `Botao`, `Campo`, `Chips`, `Selo`…). Não use `Alert.alert` (não funciona na web): use `useDialogos()` (`confirmar`, `avisar`).
- Cores sempre via `useCores()` (`src/lib/tema.ts`); nunca cores fixas em tela.
- Telas com dados usam `useConsulta()` (recarrega ao focar) e oferecem **puxar para atualizar** (`<Tela atualizando onAtualizar>` ou `usePuxar`).
- Dinheiro: use `lerValor`/`brl`/`brlReais`/`paraReais` de `dinheiro.ts`. Nunca some `number` em reais com ponto flutuante para gravar.
- Dropdowns: `Selecao` (fecha o teclado ao abrir). Listas: descrição em destaque, código como texto secundário.
- **Textos curtos e objetivos** (títulos de 1–2 palavras, avisos de uma frase, sem explicar o óbvio). Siga o guia em [app.md › Textos da interface](app.md#textos-da-interface).
- O lint segue as regras do React Compiler: não mutar estado/props, não chamar setState síncrono em efeito sem necessidade.
