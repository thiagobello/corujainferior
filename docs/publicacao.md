# Publicação (custo zero)

O app web é uma SPA estática (`npx expo export --platform web` → pasta `dist/`). O banco já roda no Supabase (plano gratuito). Recomendação: **Cloudflare Pages** — gratuito, banda ilimitada para sites estáticos e permite uso comercial. (O plano gratuito da Vercel, "Hobby", é só para uso pessoal/não comercial.)

Arquivos de configuração já no projeto:
- `wrangler.jsonc` → Cloudflare Workers: publica `dist/` como SPA (toda rota abre o app; ex.: `/orcamentos/123`). O `name` precisa ser igual ao nome do Worker no painel.
- `.node-version` → Node 22 no build da Cloudflare.
- `vercel.json` → comando de build, pasta `dist` e rewrite para `/` (Vercel).
- Cloudflare Pages não precisa de arquivo extra: sem `404.html`, ele já trata o site como SPA.

## 1. Conferir o Supabase

1. **Migrations:** todas as do `README.md` (passo "Crie o banco") aplicadas em ordem. Conferência rápida no SQL Editor — deve retornar 4 linhas:
   ```sql
   select proname from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('registrar_venda', 'salvar_orcamento', 'sugerir_modelos', 'listar_grupos');
   ```
2. **Chaves:** Project Settings › API Keys → **Project URL** e **publishable key** (`sb_publishable_…`; a antiga "anon key" também funciona). Nunca use a secret/service_role.
3. **Teste local:** `.env.local` com as duas variáveis → `npx expo start --web` → crie a primeira conta (vira administradora).

## 2. Enviar o código para o GitHub

1. Em github.com › **New repository** → nome (ex.: `coruja-inferior`), **Private**, sem README.
2. No terminal:
   ```bash
   cd ~/Documents/corujainferior
   git add -A
   git commit -m "Coruja Inferior: primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/coruja-inferior.git
   git push -u origin main
   ```
   `.env.local` e planilhas `.xlsx` não sobem (estão no `.gitignore`).

## 3. Cloudflare

A Cloudflare oferece dois caminhos gratuitos. A tela de criação costuma abrir no **Workers** (campos *Deploy command* e *Preview command*); os dois funcionam.

### Opção A — Workers (tela padrão)

1. dash.cloudflare.com › **Workers & Pages › Create › Import a repository** › escolha o repositório.
2. **Project name:** `corujainferior` (igual ao `name` do `wrangler.jsonc`; se usar outro nome, altere o arquivo também).
3. **Build settings:**
   | Campo | Valor |
   |---|---|
   | Build command | `npx expo export --platform web` |
   | Deploy command | `npx wrangler deploy` (padrão) |
   | Non-production branch deploy command / Preview command | `npx wrangler versions upload` (ou deixe o padrão) |
   | Root directory | `/` (vazio) |
4. **Variáveis de build** (em *Advanced settings › Build variables*, ou depois em **Settings › Build › Variables and secrets**). Precisam ser de **build**, não de runtime, porque entram no app durante o build:
   | Nome | Valor |
   |---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
5. **Deploy.** O app fica em `https://corujainferior.SEU-SUBDOMINIO.workers.dev`.
6. **Atualizações:** cada `git push` na `main` publica sozinho. Mudou variável → **Deployments › Retry build**.

### Opção B — Pages

1. **Workers & Pages › Create ›** aba/link **Pages › Connect to Git** › escolha o repositório.
2. Framework preset **None** · Build command `npx expo export --platform web` · Build output directory `dist`.
3. Environment variables (Production e Preview): as duas `EXPO_PUBLIC_*` acima e `NODE_VERSION` = `22`.
4. **Save and Deploy** → `https://NOME.pages.dev`. Cada `git push` publica sozinho.

### Sem GitHub (envio direto do computador)

```bash
npx expo export --platform web     # usa o .env.local
npx wrangler deploy                # Workers (usa o wrangler.jsonc)
# ou: npx wrangler pages deploy dist --project-name corujainferior   (Pages)
```

## 4. Ajustar o login no Supabase

1. **Authentication › URL Configuration:**
   - Site URL: a URL publicada (`…workers.dev` ou `…pages.dev`)
   - Redirect URLs: a mesma URL e `http://localhost:8081` (testes locais).
2. Para só 3–4 usuários, considere desligar a confirmação de e-mail: **Authentication › Sign In / Providers › Email › Confirm email**. Com ela ligada, cada conta nova precisa clicar no link do e-mail (que leva à Site URL).

## 5. Primeiro uso

1. Abra a URL e entre (ou crie a primeira conta, que vira administradora).
2. As outras pessoas criam a própria conta no login e entram como vendedoras; ajuste em **Mais › Usuários**.
3. Cadastre os percentuais em **Mais › Taxas**.

## 6. Instalar nos aparelhos

- **iPhone:** abra a URL no **Safari** › Compartilhar › **Adicionar à Tela de Início**.
- **Tablet Android:** **Chrome** › menu ⋮ › **Instalar app** / **Adicionar à tela inicial**.
- Câmera e fotos funcionam porque o site usa HTTPS.

## 7. Domínio próprio (opcional)

Registre no registro.br (~R$ 40/ano para `.com.br`) e, no projeto da Cloudflare, **Settings › Domains & Routes** (Workers) ou **Custom domains** (Pages); siga as instruções de DNS. Depois atualize a Site URL/Redirect URLs do Supabase.

## Vercel (alternativa)

vercel.com › **Add New › Project** › importe o repositório (o `vercel.json` já define build e saída) › adicione as duas variáveis `EXPO_PUBLIC_*` › **Deploy** → `https://NOME.vercel.app`. Lembre: o plano Hobby é para uso não comercial.

## Limites e cuidados

- Cloudflare gratuito: requisições a arquivos estáticos e banda ilimitadas; builds com limite mensal generoso.
- Supabase gratuito: ~500 MB de banco, ~1 GB de fotos, pausa após 7 dias sem uso, **sem backup automático** — configure um backup periódico (ver `decisoes-e-pendencias.md`).
