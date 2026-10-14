# Documentação — Coruja Inferior

Sistema de estoque, vendas, financeiro e orçamentos de reforma das marcas **Coruja Sports** e **Arquibancada Inferior** (camisas de futebol). Um único código Expo/React Native gera o **site responsivo** e os **apps iOS/Android**; o backend é **Supabase** (Postgres + Auth + Storage).

Esta pasta é a fonte de verdade para qualquer pessoa ou agente que for alterar o sistema. **Mantenha-a atualizada a cada mudança.**

| Documento | Conteúdo |
|---|---|
| [arquitetura.md](arquitetura.md) | Tecnologias, estrutura de pastas, comandos, ambiente, testes, publicação e convenções de código |
| [regras-de-negocio.md](regras-de-negocio.md) | Todas as regras: produtos, códigos, estoque, vendas, taxas, divisão entre marcas, repasses, orçamentos… |
| [banco-de-dados.md](banco-de-dados.md) | Tipos, tabelas, views, funções (RPC), gatilhos, permissões, storage e como criar migrations |
| [app.md](app.md) | Telas (rotas), componentes, módulos de `src/lib`, fluxos principais e padrões de interface |
| [publicacao.md](publicacao.md) | Passo a passo para publicar de graça (Cloudflare Pages ou Vercel) com o Supabase |
| [decisoes-e-pendencias.md](decisoes-e-pendencias.md) | Decisões tomadas com o dono do sistema (e por quê), legados e o que falta fazer |

## Resumo em 1 minuto

- **Usuários:** 3 pessoas em iPhone, 1 tablet Android fixo na loja e acesso frequente pelo navegador. Publicação recomendada: **web/PWA** (custo zero).
- **Unidade física = 1 registro** em `produtos`, com código único (ex.: `M1387`) escrito na etiqueta.
- **Toda regra crítica roda no banco** (funções `security definer`), nunca só no app: venda atômica e idempotente, status protegido, códigos sem reuso, divisão financeira e repasses.
- **Dinheiro:** `numeric(12,2)` no banco e centavos inteiros no app (`src/lib/dinheiro.ts`), com o mesmo arredondamento.
- **Testes:** `npm test` roda todas as migrations num Postgres embutido (PGlite) e testa as regras de negócio.
- **Interface 100% em português do Brasil**, tema azul, claro/escuro.
