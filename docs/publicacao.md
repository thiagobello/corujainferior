# Publicação (custo zero)

O app web é uma SPA estática (`npx expo export --platform web` → pasta `dist/`). O banco já roda no Supabase (plano gratuito). Recomendação: **Cloudflare Pages** — gratuito, banda ilimitada para sites estáticos e permite uso comercial. (O plano gratuito da Vercel, "Hobby", é só para uso pessoal/não comercial.)

Arquivos de configuração já no projeto:
- `public/_redirects` → `/*  /index.html  200` (Cloudflare: toda rota abre o app; ex.: `/orcamentos/123`).
- `vercel.json` → comando de build, pasta `dist` e rewrite para `/` (Vercel).

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

## 3. Cloudflare Pages

1. Crie a conta em dash.cloudflare.com (grátis).
2. **Workers & Pages › Create › Pages › Connect to Git** (se a tela abrir em "Workers", procure a aba/link **Pages**). Autorize o GitHub e escolha o repositório.
3. **Build settings:**
   | Campo | Valor |
   |---|---|
   | Framework preset | None |
   | Build command | `npx expo export --platform web` |
   | Build output directory | `dist` |
   | Root directory | (vazio) |
4. **Environment variables** (Production e Preview):
   | Nome | Valor |
   |---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `NODE_VERSION` | `22` |
5. **Save and Deploy.** Em ~3 minutos o app fica em `https://NOME-DO-PROJETO.pages.dev`.
6. **Atualizações:** cada `git push` na `main` publica sozinho. Mudou uma variável de ambiente → **Deployments › Retry deployment** (as variáveis entram no build).

**Alternativa sem GitHub (envio direto):**
```bash
npx expo export --platform web        # usa o .env.local
npx wrangler pages deploy dist --project-name coruja-inferior
```
Na primeira vez o Wrangler abre o navegador para login. Repita os dois comandos a cada atualização.

## 4. Ajustar o login no Supabase

1. **Authentication › URL Configuration:**
   - Site URL: `https://NOME-DO-PROJETO.pages.dev`
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

Registre no registro.br (~R$ 40/ano para `.com.br`) e, no projeto Pages, **Custom domains › Set up a domain**; siga as instruções de DNS. Depois atualize a Site URL/Redirect URLs do Supabase.

## Vercel (alternativa)

vercel.com › **Add New › Project** › importe o repositório (o `vercel.json` já define build e saída) › adicione as duas variáveis `EXPO_PUBLIC_*` › **Deploy** → `https://NOME.vercel.app`. Lembre: o plano Hobby é para uso não comercial.

## Limites e cuidados

- Cloudflare Pages gratuito: 500 builds/mês; requisições e banda de site estático ilimitadas.
- Supabase gratuito: ~500 MB de banco, ~1 GB de fotos, pausa após 7 dias sem uso, **sem backup automático** — configure um backup periódico (ver `decisoes-e-pendencias.md`).
