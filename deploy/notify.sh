#!/usr/bin/env bash
# Сообщение или файл в Telegram-канал платформы (настройка: sudo b2b-telegram setup, docs/deploy.md раздел 9).
#   b2b-notify "текст"
#   b2b-notify --key disk --every 21600 "текст"   не чаще раза в 6 часов для одного ключа
#   b2b-notify --quiet "текст"                     без звука у получателей
#   b2b-notify --file /путь/архив.7z.001 "подпись" файл до 50 МБ (лимит Telegram для ботов)
# Telegram не настроен — молча выходит с кодом 0, чтобы копии и проверки не ломались.
# Код 3 — сообщение пропущено из-за ограничения частоты, 1 — Telegram не принял.
# Текст перед отправкой очищается от паролей, токенов, строк подключения к базе и полных номеров телефонов.
set -uo pipefail
CONF="${TELEGRAM_CONF:-/etc/b2b-orders/telegram.env}"
STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/b2b-orders-monitor}"
APP_ENV="${APP_ENV:-/opt/b2b-orders/.env}"
HOURLY_LIMIT="${TELEGRAM_HOURLY_LIMIT:-30}" # больше сообщений в час не шлём (кроме файлов копий)
TG_API="${TELEGRAM_API:-https://api.telegram.org}" # другой адрес — только для проверок

KEY="" EVERY=0 QUIET=false FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY="$2"; shift 2 ;;
    --every) EVERY="$2"; shift 2 ;;
    --quiet) QUIET=true; shift ;;
    --file) FILE="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done
TEXT="${*:-}"
[ -n "$TEXT" ] || [ -n "$FILE" ] || TEXT="$(cat)"

[ -r "$CONF" ] || exit 0
# shellcheck disable=SC1090
. "$CONF"
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || exit 0
install -d -m 700 "$STATE_DIR"
NOW="$(date +%s)"

# Скрываем секреты: строки подключения, токены ботов, пароли/ключи в виде key=value, длинные случайные строки, телефоны
scrub() {
  sed -E \
    -e 's#((postgres(ql)?|mysql|redis|https?)://)[^/@[:space:]]+@#\1***@#g' \
    -e 's#bot[0-9]{5,}:[A-Za-z0-9_-]{20,}#bot***#g' \
    -e 's#[0-9]{6,}:[A-Za-z0-9_-]{30,}#***#g' \
    -e 's#((pass(word|wd|phrase)?|secret|token|api[_-]?key|private[_-]?key|authorization|cookie|session)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^"'"'"'[:space:],;&]+#\1***#Ig' \
    -e 's#(Bearer|Basic) [A-Za-z0-9._~+/=-]+#\1 ***#g' \
    -e 's#[A-Za-z0-9_+/=-]{40,}#***#g' \
    -e 's#\+?998[[:space:]-]?\(?([0-9]{2})\)?[[:space:]-]?[0-9]{3}[[:space:]-]?[0-9]{2}[[:space:]-]?([0-9]{2})#+998 \1 ***-**-\2#g'
}

# Ключ ограничения частоты: не чаще раза в EVERY секунд
if [ -n "$KEY" ] && [ "$EVERY" -gt 0 ]; then
  RL="$STATE_DIR/rl_${KEY//[^A-Za-z0-9_-]/_}"
  LAST="$(cat "$RL" 2>/dev/null || echo 0)"
  [ $((NOW - LAST)) -ge "$EVERY" ] || exit 3
fi

# Защита от потока сообщений: не больше HOURLY_LIMIT в час; один раз предупреждаем, что приглушили
LOG="$STATE_DIR/sent.log"
if [ -z "$FILE" ]; then
  RECENT="$(awk -v t=$((NOW - 3600)) '$1 > t' "$LOG" 2>/dev/null | wc -l)"
  if [ "$RECENT" -ge "$HOURLY_LIMIT" ]; then
    MUTED="$STATE_DIR/muted"
    if [ $((NOW - $(cat "$MUTED" 2>/dev/null || echo 0))) -ge 3600 ]; then
      echo "$NOW" > "$MUTED"
      TEXT="🔇 За час уже $RECENT сообщений — остальные приглушены до конца часа. Журнал: sudo journalctl -u b2b-orders -n 100"
    else
      echo "b2b-notify: лимит $HOURLY_LIMIT сообщений в час, пропущено" >&2; exit 3
    fi
  fi
fi

LABEL="${TELEGRAM_LABEL:-$(grep -oP '^APP_DOMAIN="?\K[^"]+' "$APP_ENV" 2>/dev/null || hostname)}"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

if [ -n "$FILE" ]; then
  [ -f "$FILE" ] || { echo "b2b-notify: нет файла $FILE" >&2; exit 1; }
  { printf '%s\n' "$LABEL"; printf '%s' "$TEXT" | scrub; } | head -c 1000 > "$TMP"
  METHOD=sendDocument
  # Токен передаётся через stdin (-K -), а не в аргументах: так его не видно в списке процессов
  OUT="$(printf 'url = "%s/bot%s/%s"\n' "$TG_API" "$TELEGRAM_BOT_TOKEN" "$METHOD" | curl -sS -K - \
    --retry 3 --retry-delay 5 --max-time 900 \
    -F "chat_id=$TELEGRAM_CHAT_ID" -F "disable_notification=true" -F "document=@$FILE" -F "caption=<$TMP" 2>&1)"
else
  { printf '%s\n' "$LABEL"; printf '%s' "$TEXT" | scrub; } | head -c 4000 > "$TMP"
  OUT="$(printf 'url = "%s/bot%s/sendMessage"\n' "$TG_API" "$TELEGRAM_BOT_TOKEN" | curl -sS -K - \
    --retry 3 --retry-delay 5 --max-time 60 \
    --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" --data-urlencode "disable_notification=$QUIET" \
    --data-urlencode "disable_web_page_preview=true" --data-urlencode "text@$TMP" 2>&1)"
fi

if printf '%s' "$OUT" | grep -Eq '"ok": ?true'; then
  echo "$NOW" >> "$LOG"
  tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  [ -z "$KEY" ] || [ "$EVERY" -le 0 ] || echo "$NOW" > "$RL"
  exit 0
fi
# В ответе Telegram токена нет, но на всякий случай чистим и его
echo "b2b-notify: Telegram не принял сообщение: $(printf '%s' "$OUT" | scrub | head -c 300)" >&2
exit 1
