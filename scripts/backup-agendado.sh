#!/usr/bin/env bash
# Executado pelo agendador do macOS (launchd), toda segunda às 15h.
# Roda o backup, guarda a saída no log e avisa por notificação.
# Instalar/remover o agendamento: ./scripts/agendar-backup.sh
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/coruja-backup.log"
mkdir -p "$(dirname "$LOG")"

saida=$("$RAIZ/scripts/backup.sh" 2>&1)
codigo=$?
{
  echo "=== $(date '+%d/%m/%Y %H:%M:%S') · saída $codigo ==="
  echo "$saida"
  echo
} >> "$LOG"

if [[ $codigo -eq 0 ]]; then
  titulo="Backup Coruja concluído"
  mensagem=$(grep -E "produtos ·" <<<"$saida" | sed 's/^ *//')
else
  titulo="Backup Coruja falhou"
  mensagem=$(grep -v '^[[:space:]]*$' <<<"$saida" | grep -vi '^psql\|^pg_dump\|^connection to' | tail -1)
  mensagem="${mensagem:-Veja o log em ~/Library/Logs/coruja-backup.log}"
fi
mensagem="${mensagem//\"/\'}"
osascript -e "display notification \"${mensagem:0:200}\" with title \"$titulo\" sound name \"Glass\"" >/dev/null 2>&1

exit $codigo
