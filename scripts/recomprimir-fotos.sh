#!/usr/bin/env bash
# Recomprime as fotos antigas do bucket "produtos" (enviadas antes da compressão no app).
#
#   ./scripts/recomprimir-fotos.sh [pasta-de-fotos]            # só simula (padrão)
#   ./scripts/recomprimir-fotos.sh [pasta-de-fotos] --enviar   # substitui no Supabase
#
# Parte de um backup já baixado (scripts/backup.sh): sem pasta, usa o fotos/ do backup
# mais recente. Gera fotos-recomprimidas/ ao lado, com o mesmo caminho de cada arquivo,
# usando o mesmo padrão do app (lado maior 1280 px, JPEG qualidade 70, via sips do macOS).
#
# Com --enviar, regrava cada arquivo NO MESMO CAMINHO do bucket: o foto_path dos produtos
# e orçamentos não muda, então o banco não é tocado. Os originais continuam no backup.
# Precisa de SUPABASE_SERVICE_ROLE_KEY em .env.backup.local (nunca no app) e de
# EXPO_PUBLIC_SUPABASE_URL no .env.local.
set -euo pipefail
umask 077

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

LADO=1280
QUALIDADE=70
MINIMO_KB=600      # foto menor que isso já está boa
GANHO_MINIMO=70    # só substitui se o novo tiver no máximo 70% do tamanho original

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

ENVIAR=0
ORIGEM=""
for a in "$@"; do
  case "$a" in
    --enviar) ENVIAR=1 ;;
    *) ORIGEM="$a" ;;
  esac
done

if [[ -z "$ORIGEM" ]]; then
  BASE="${BACKUP_DIR:-$HOME/Backups/coruja}"
  ultimo="$(ls -d "$BASE"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_* 2>/dev/null | sort | tail -1 || true)"
  [[ -n "$ultimo" ]] || { echo "Nenhum backup em $BASE. Rode ./scripts/backup.sh antes." >&2; exit 1; }
  ORIGEM="$ultimo/fotos"
fi
[[ -d "$ORIGEM" ]] || { echo "Pasta não encontrada: $ORIGEM" >&2; exit 1; }
command -v sips >/dev/null || { echo "Precisa do sips (macOS)." >&2; exit 1; }

ORIGEM="$(cd "$ORIGEM" && pwd)"
DESTINO="$(dirname "$ORIGEM")/fotos-recomprimidas"
mkdir -p "$DESTINO"
LISTA="$DESTINO/substituir.txt"
: > "$LISTA"

antes=0; depois=0; total=0; trocar=0
while IFS= read -r -d '' f; do
  rel="${f#"$ORIGEM"/}"
  tam=$(stat -f %z "$f")
  total=$((total + 1))
  antes=$((antes + tam))
  if (( tam < MINIMO_KB * 1024 )); then depois=$((depois + tam)); continue; fi
  novo="$DESTINO/$rel"
  mkdir -p "$(dirname "$novo")"
  # Mesmo nome e extensão .jpg do caminho salvo no banco; a saída é sempre JPEG.
  if ! sips -Z "$LADO" -s format jpeg -s formatOptions "$QUALIDADE" "$f" --out "$novo" >/dev/null 2>&1; then
    echo "  falhou: $rel" >&2; depois=$((depois + tam)); continue
  fi
  ntam=$(stat -f %z "$novo")
  if (( ntam * 100 <= tam * GANHO_MINIMO )); then
    depois=$((depois + ntam)); trocar=$((trocar + 1)); echo "$rel" >> "$LISTA"
  else
    depois=$((depois + tam)); rm -f "$novo"
  fi
done < <(find "$ORIGEM" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) -print0)

mb() { awk -v b="$1" 'BEGIN{printf "%.1f MB", b/1048576}'; }
echo "Fotos: $total  |  a substituir: $trocar"
echo "Antes: $(mb $antes)  |  depois: $(mb $depois)  |  libera: $(mb $((antes - depois)))"
echo "Arquivos novos em: $DESTINO"

(( ENVIAR )) || { echo "Simulação: nada foi enviado. Confira algumas fotos e rode de novo com --enviar."; exit 0; }
(( trocar > 0 )) || { echo "Nada a enviar."; exit 0; }

URL="${EXPO_PUBLIC_SUPABASE_URL:-}"
CHAVE="${SUPABASE_SERVICE_ROLE_KEY:-}"
[[ -n "$URL" && -n "$CHAVE" ]] || { echo "Faltam EXPO_PUBLIC_SUPABASE_URL (.env.local) e SUPABASE_SERVICE_ROLE_KEY (.env.backup.local)." >&2; exit 1; }

echo
echo "Vai substituir $trocar fotos no bucket \"produtos\" de $URL."
echo "Os originais ficam em $ORIGEM. Faça um backup novo antes se este for antigo."
read -r -p "Digite ENVIAR para continuar: " ok
[[ "$ok" == "ENVIAR" ]] || { echo "Cancelado."; exit 1; }

falhas=0
while IFS= read -r rel; do
  # PUT = substitui o objeto existente no mesmo caminho.
  codigo=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
    -H "Authorization: Bearer $CHAVE" -H "apikey: $CHAVE" \
    -H "Content-Type: image/jpeg" -H "cache-control: max-age=3600" -H "x-upsert: true" \
    --data-binary "@$DESTINO/$rel" "$URL/storage/v1/object/produtos/$rel") || codigo=000
  if [[ "$codigo" == 2* ]]; then echo "  ok: $rel"; else echo "  erro $codigo: $rel" >&2; falhas=$((falhas + 1)); fi
done < "$LISTA"

echo "Concluído: $((trocar - falhas)) substituídas, $falhas com erro."
(( falhas == 0 )) || exit 2
