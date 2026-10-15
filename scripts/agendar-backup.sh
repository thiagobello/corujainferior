#!/usr/bin/env bash
# Agenda o backup semanal no macOS (launchd): toda segunda às 15h.
#
#   ./scripts/agendar-backup.sh            instala (ou atualiza) o agendamento
#   ./scripts/agendar-backup.sh agora      roda o backup agendado imediatamente (teste)
#   ./scripts/agendar-backup.sh status     mostra se está agendado e o último resultado
#   ./scripts/agendar-backup.sh remover    remove o agendamento
#
# Se o Mac estiver dormindo no horário, roda ao acordar; se estiver desligado,
# a semana é pulada. Log: ~/Library/Logs/coruja-backup.log
#
# O macOS não deixa tarefas agendadas lerem a pasta Documentos, onde fica o
# projeto. Por isso a instalação copia os scripts e a configuração para
# ~/Library/Application Support/CorujaBackup (acesso só do usuário).
# Mudou a senha (.env.backup.local) ou o script? Rode a instalação de novo.
set -euo pipefail

ROTULO="br.com.corujainferior.backup"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ALVO="gui/$(id -u)"
LOG="$HOME/Library/Logs/coruja-backup.log"
INST="$HOME/Library/Application Support/CorujaBackup"

# Dia/hora (Weekday: 0 = domingo, 1 = segunda … 6 = sábado).
DIA=1
HORA=15
MINUTO=0

case "${1:-instalar}" in
  instalar)
    [[ -f "$RAIZ/.env.backup.local" ]] || { echo "Crie .env.backup.local antes (modelo em .env.backup.example)." >&2; exit 1; }
    # Cópia fora de Documentos, com a configuração (senha) protegida.
    mkdir -p "$INST/scripts" "$(dirname "$PLIST")" "$(dirname "$LOG")"
    chmod 700 "$INST"
    cp "$RAIZ/scripts/backup.sh" "$RAIZ/scripts/backup-agendado.sh" "$INST/scripts/"
    chmod 700 "$INST/scripts/"*.sh
    install -m 600 "$RAIZ/.env.backup.local" "$INST/.env.backup.local"
    grep '^EXPO_PUBLIC_SUPABASE_URL=' "$RAIZ/.env.local" > "$INST/.env.local" 2>/dev/null || true
    chmod 600 "$INST/.env.local"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$INST/scripts/backup-agendado.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>$DIA</integer>
    <key>Hour</key>
    <integer>$HORA</integer>
    <key>Minute</key>
    <integer>$MINUTO</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
PLIST
    launchctl bootout "$ALVO/$ROTULO" 2>/dev/null || true
    launchctl bootstrap "$ALVO" "$PLIST"
    echo "Backup agendado: toda segunda às ${HORA}h$(printf '%02d' $MINUTO)."
    echo "Teste agora com: ./scripts/agendar-backup.sh agora"
    ;;
  agora)
    launchctl kickstart -k "$ALVO/$ROTULO"
    echo "Backup iniciado em segundo plano. Aguarde a notificação (ou veja: tail -f $LOG)."
    ;;
  status)
    if launchctl print "$ALVO/$ROTULO" >/dev/null 2>&1; then
      echo "Agendado: toda segunda às ${HORA}h$(printf '%02d' $MINUTO)."
      launchctl print "$ALVO/$ROTULO" | grep -m1 "last exit code" | sed -E 's/.*= //; s/^0$/ok/; s/\(never exited\)/ainda não rodou desde a instalação/; s/^/  Última execução (código): /'
    else
      echo "Não está agendado. Instale com: ./scripts/agendar-backup.sh"
    fi
    [[ -f "$LOG" ]] && { echo "Último registro:"; grep "^===" "$LOG" | tail -1; }
    ;;
  remover)
    launchctl bootout "$ALVO/$ROTULO" 2>/dev/null || true
    rm -f "$PLIST"
    rm -rf "$INST"
    echo "Agendamento removido (os backups em ~/Backups/coruja foram mantidos)."
    ;;
  *)
    echo "Uso: $0 [instalar|agora|status|remover]" >&2
    exit 1
    ;;
esac
