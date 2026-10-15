@AGENTS.md

# Coruja Inferior

Sistema de estoque, vendas, financeiro, repasses e orçamentos das marcas Coruja Sports e Arquibancada Inferior (Expo SDK 57 + Supabase). Interface e código em português do Brasil.

- **Contexto completo:** `docs/` (comece por `docs/README.md`). Para qualquer mudança no sistema, use o agente **`coruja-especialista`** (`.claude/agents/coruja-especialista.md`) ou leia os documentos da área antes de alterar.
- **Backup:** use o agente **`coruja-backup`** (roda `scripts/backup.sh` e valida). Nunca exiba a senha do `.env.backup.local`.
- Regras críticas ficam no banco (funções em `supabase/migrations/`). Nunca edite migration existente: crie uma nova.
- Antes de concluir: `npm test`, `npx tsc --noEmit`, `npx expo lint` e, se mexeu em telas, `npx expo export --platform web`.
- Mantenha `docs/` e a lista de migrations do `README.md` atualizadas a cada mudança.
