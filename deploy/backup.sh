#!/usr/bin/env bash
# Резервная копия: база (pg_dump) и загруженные фото/логотипы. Хранятся KEEP_DAYS дней (по умолчанию 14).
#   sudo b2b-backup
# Если подключён Telegram (sudo b2b-telegram setup), копия уходит ещё и в канал: архив 7z с паролем (AES-256),
# разбитый на части по 45 МБ (лимит Telegram для ботов — 50 МБ). Об ошибке копии приходит сообщение.
# Восстановление — docs/deploy.md, разделы 5 и 9.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/var/backups/b2b-orders}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/b2b-orders/uploads}"
DB_NAME="${DB_NAME:-b2b}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/b2b-orders-monitor}"
TG_CONF="${TELEGRAM_CONF:-/etc/b2b-orders/telegram.env}"
PASS_FILE="${BACKUP_PASS_FILE:-/etc/b2b-orders/backup.pass}"
NOTIFY=/usr/local/sbin/b2b-notify
STAMP="$(date +%Y-%m-%d_%H%M)"
notify() { [ -x "$NOTIFY" ] && "$NOTIFY" "$@" || true; }
trap 'notify "❌ Резервная копия $STAMP не сделана (ошибка в строке $LINENO). Проверить: sudo b2b-backup"' ERR

install -d -m 700 "$BACKUP_DIR" "$STATE_DIR"
sudo -u postgres pg_dump --format=custom "$DB_NAME" > "$BACKUP_DIR/db_$STAMP.dump"
tar -czf "$BACKUP_DIR/uploads_$STAMP.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
chmod 600 "$BACKUP_DIR"/*_"$STAMP".*
find "$BACKUP_DIR" -type f \( -name 'db_*.dump' -o -name 'uploads_*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
DB_SIZE="$(du -h "$BACKUP_DIR/db_$STAMP.dump" | cut -f1)"
UP_SIZE="$(du -h "$BACKUP_DIR/uploads_$STAMP.tar.gz" | cut -f1)"
echo "Копия $STAMP: $DB_SIZE база, $UP_SIZE файлы"
date +%s > "$STATE_DIR/backup_at"
echo "база $DB_SIZE, фото $UP_SIZE (на сервере)" > "$STATE_DIR/backup_info"
trap - ERR

# ── Отправка в Telegram ──
[ -r "$TG_CONF" ] || exit 0
# shellcheck disable=SC1090
. "$TG_CONF"
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || exit 0
[ "${TELEGRAM_SEND_BACKUPS:-1}" != 0 ] || { notify --quiet "✅ Резервная копия $STAMP: база $DB_SIZE, фото $UP_SIZE (в канал не отправляется)"; exit 0; }
SEVENZ="$(command -v 7z || command -v 7zz || true)"
if [ -z "$SEVENZ" ] || [ ! -s "$PASS_FILE" ]; then
  notify "⚠️ Копия $STAMP сделана на сервере, но в канал не отправлена: $([ -n "$SEVENZ" ] && echo 'нет пароля архивов' || echo 'не установлен 7-Zip'). Исправить: sudo b2b-telegram setup"
  exit 0
fi

MAX_MB="${TELEGRAM_BACKUP_MAX_MB:-500}" # фото больше этого размера в канал не шлём (только предупреждение)
TMP="$(mktemp -d "$BACKUP_DIR/.telegram.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
PW="$(cat "$PASS_FILE")"
# pack ИМЯ ФАЙЛ: архив 7z, AES-256, имена файлов тоже зашифрованы, части по 45 МБ.
# Пароль подаётся через stdin, а не в аргументах — так его не видно в списке процессов.
pack() {
  printf '%s\n%s\n' "$PW" "$PW" | "$SEVENZ" a -bd -bso0 -bsp0 -p -mhe=on -mx=1 -v45m "$TMP/$1.7z" "$2" >/dev/null
  printf '%s\n' "$PW" | "$SEVENZ" t -bso0 -bsp0 "$TMP/$1.7z.001" >/dev/null # проверяем, что архив открывается
}
send_parts() { # send_parts ИМЯ ПОДПИСЬ
  local parts=("$TMP/$1".7z.*) i=0
  for f in "${parts[@]}"; do
    i=$((i + 1))
    "$NOTIFY" --file "$f" "$2 · часть $i из ${#parts[@]}" || return 1
  done
}

SENT=() FAILED=()
if pack "b2b-db_$STAMP" "$BACKUP_DIR/db_$STAMP.dump" && send_parts "b2b-db_$STAMP" "🗄 База $STAMP"; then
  SENT+=("база $DB_SIZE"); else FAILED+=("база"); fi
UP_BYTES="$(stat -c %s "$BACKUP_DIR/uploads_$STAMP.tar.gz")"
if [ "$UP_BYTES" -gt $((MAX_MB * 1024 * 1024)) ]; then
  SKIPPED="фото ($UP_SIZE) больше $MAX_MB МБ — лежат только на сервере, скачайте их к себе (docs/deploy.md, раздел 5)"
elif pack "b2b-uploads_$STAMP" "$BACKUP_DIR/uploads_$STAMP.tar.gz" && send_parts "b2b-uploads_$STAMP" "🖼 Фото $STAMP"; then
  SENT+=("фото $UP_SIZE"); else FAILED+=("фото"); fi

if [ ${#FAILED[@]} -eq 0 ]; then
  echo "база $DB_SIZE, фото $UP_SIZE · в канале ✓" > "$STATE_DIR/backup_info"
  notify --quiet "✅ Резервная копия $STAMP: $(IFS=,; echo "${SENT[*]}" | sed 's/,/, /g') — в канале выше. Архивы открываются паролем, который хранится у вас (в канал он не отправляется).${SKIPPED:+
⚠️ $SKIPPED}"
else
  echo "база $DB_SIZE, фото $UP_SIZE · в канал не ушло: ${FAILED[*]}" > "$STATE_DIR/backup_info"
  notify "⚠️ Резервная копия $STAMP сделана на сервере, но в канал не отправлено: ${FAILED[*]}. Повторить: sudo b2b-backup"
fi
