#!/usr/bin/env bash
# Backup do Coruja Inferior: banco (Supabase) + fotos, numa pasta datada.
#
#   ./scripts/backup.sh
#
# Precisa de:
#   - Postgres.app (pg_dump/psql) instalado
#   - .env.backup.local na raiz do projeto com SUPABASE_DB_URL (Session pooler,
#     porta 5432) — modelo em .env.backup.example
#   - .env.local com EXPO_PUBLIC_SUPABASE_URL (já usado pelo app)
#
# Gera em ~/Backups/coruja/AAAA-MM-DD_HHMMSS/ (ou BACKUP_DIR) e, se o backup
# novo estiver completo, apaga os anteriores (fica só o último):
#   banco.dump      tudo do schema public (restaurar com pg_restore)
#   banco.sql       o mesmo em SQL legível
#   usuarios.sql    contas de login (auth.users e auth.identities)
#   fotos/          arquivos do bucket "produtos"
set -euo pipefail
umask 077   # arquivos e pastas do backup só para o usuário (dados de clientes)

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

# Lê VAR=valor dos arquivos sem sobrescrever o que já veio do ambiente.
carregar() {
  [[ -f "$1" ]] || return 0
  local k v
  while IFS='=' read -r k v || [[ -n "$k" ]]; do
    [[ "$k" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    v="${v%\"}"; v="${v#\"}"; v="${v/#\$HOME/$HOME}"
    [[ -n "${!k:-}" ]] || export "$k=$v"
  done < "$1"
}
carregar .env.backup.local
carregar .env.local

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Crie .env.backup.local a partir de .env.backup.example (endereço do banco com a senha)." >&2
  exit 1
fi

if [[ "$SUPABASE_DB_URL" == *"SUA_SENHA"* || "$SUPABASE_DB_URL" == *"[YOUR-PASSWORD]"* ]]; then
  echo "Troque a senha de exemplo em .env.backup.local pela senha do banco." >&2
  exit 1
fi

# pg_dump precisa do modo Session (porta 5432); o Transaction pooler (6543)
# não serve para dump. No pooler do Supabase o host é o mesmo nos dois modos.
if [[ "$SUPABASE_DB_URL" == *".pooler.supabase.com:6543"* ]]; then
  SUPABASE_DB_URL="${SUPABASE_DB_URL/.pooler.supabase.com:6543/.pooler.supabase.com:5432}"
  echo "Aviso: usando a porta 5432 (Session pooler) em vez de 6543 (Transaction pooler)."
fi

# Ferramentas do Postgres.app (ou as que estiverem no PATH).
PG_BIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
[[ -x "$PG_BIN/pg_dump" ]] || PG_BIN="$(dirname "$(command -v pg_dump)")"
PG_DUMP="$PG_BIN/pg_dump"
PSQL="$PG_BIN/psql"

# Confere a conexão antes de criar qualquer arquivo.
if ! versao=$("$PSQL" "$SUPABASE_DB_URL" -Atc 'show server_version' 2>&1); then
  echo "Não foi possível conectar ao banco. Confira o endereço e a senha em .env.backup.local." >&2
  echo "$versao" >&2
  exit 1
fi

# Segundos no nome: duas execuções no mesmo minuto não usam a mesma pasta.
BASE="${BACKUP_DIR:-$HOME/Backups/coruja}"
DESTINO="$BASE/$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$DESTINO/fotos"
chmod 700 "$DESTINO"   # contém dados de clientes
# Se algo falhar no meio, não deixa um backup incompleto parecendo válido.
trap 'echo "Backup falhou; pasta incompleta removida." >&2; rm -rf "$DESTINO"' ERR

echo "→ Banco (Postgres $versao)"
"$PG_DUMP" "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -Fc -f "$DESTINO/banco.dump"
"$PG_DUMP" "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges -f "$DESTINO/banco.sql"
"$PG_DUMP" "$SUPABASE_DB_URL" --data-only --schema=auth --table=auth.users --table=auth.identities -f "$DESTINO/usuarios.sql"

echo "→ Fotos"
# O bucket é público para leitura: baixa cada arquivo listado em storage.objects.
total=0
falhas=0
if [[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ]]; then
  while IFS= read -r nome; do
    [[ -z "$nome" ]] && continue
    total=$((total + 1))
    if ! curl -fsS --create-dirs -o "$DESTINO/fotos/$nome" \
      "$EXPO_PUBLIC_SUPABASE_URL/storage/v1/object/public/produtos/$nome"; then
      falhas=$((falhas + 1))
      echo "  falhou: $nome" >&2
    fi
  done < <("$PSQL" "$SUPABASE_DB_URL" -Atc "select name from storage.objects where bucket_id = 'produtos' order by name")
else
  echo "  EXPO_PUBLIC_SUPABASE_URL não encontrado no .env.local: fotos não baixadas." >&2
fi

cat > "$DESTINO/RESTAURAR.txt" <<'TXT'
Como restaurar este backup (num projeto Supabase vazio ou no mesmo, depois de limpar)
==================================================================================
Use o endereço "Session pooler" (porta 5432) com a senha do banco em DB.
Ferramentas: /Applications/Postgres.app/Contents/Versions/latest/bin

1) Usuários PRIMEIRO (os perfis dependem deles):
   psql "$DB" -f usuarios.sql

2) Banco (tabelas, funções e dados). O aviso 'schema "public" already exists' é normal:
   pg_restore --no-owner --no-privileges -d "$DB" banco.dump

3) Gatilho que cria o perfil de quem se cadastra (fica na tabela auth.users,
   por isso não vem no dump). Rode no SQL Editor:
   drop trigger if exists on_auth_user_created on auth.users;
   create trigger on_auth_user_created after insert on auth.users
     for each row execute function public.on_auth_user_created();

4) Projeto novo: rode também supabase/migrations/20261013000003_storage.sql
   (bucket "produtos" e permissões) e reenvie as fotos em Storage › produtos,
   mantendo as pastas de fotos/ (ex.: 2026-10/arquivo.jpg).
TXT

produtos=$("$PSQL" "$SUPABASE_DB_URL" -Atc "select count(*) from public.produtos")
vendas=$("$PSQL" "$SUPABASE_DB_URL" -Atc "select count(*) from public.vendas")
orcamentos=$("$PSQL" "$SUPABASE_DB_URL" -Atc "select count(*) from public.orcamentos")

echo
echo "Backup concluído em: $DESTINO"
echo "  $produtos produtos · $vendas vendas · $orcamentos orçamentos · $((total - falhas))/$total fotos"
du -sh "$DESTINO" | awk '{print "  Tamanho: " $1}'

if [[ $falhas -gt 0 ]]; then
  echo "Fotos com falha: backups anteriores mantidos." >&2
  exit 2
fi

# Mantém só o último backup, mas apenas se este estiver completo: o dump
# precisa abrir e conter as tabelas principais.
lista=$("$PG_BIN/pg_restore" --list "$DESTINO/banco.dump" 2>/dev/null || true)
for tabela in produtos vendas orcamentos prefixos; do
  if ! grep -q "TABLE public $tabela " <<<"$lista"; then
    echo "Dump sem a tabela $tabela: backups anteriores mantidos." >&2
    exit 3
  fi
done
grep -q "COPY auth.users" "$DESTINO/usuarios.sql" || { echo "usuarios.sql incompleto: backups anteriores mantidos." >&2; exit 3; }

# Só apaga pastas no formato de backup (AAAA-MM-DD_HHMM ou _HHMMSS) dentro de $BASE.
shopt -s nullglob
for antigo in "$BASE"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9] \
              "$BASE"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]; do
  [[ -d "$antigo" && "$antigo" != "$DESTINO" ]] || continue
  rm -rf "$antigo"
  echo "  Backup anterior removido: $(basename "$antigo")"
done
