#!/usr/bin/env bash
# Подключение Telegram-канала для логов и резервных копий (docs/deploy.md раздел 9).
#   sudo b2b-telegram setup      подключить бота и канал, создать пароль архивов (можно повторять)
#   sudo b2b-telegram test       проверочное сообщение
#   sudo b2b-telegram status     что настроено
#   sudo b2b-telegram password   показать пароль архивов ещё раз
#   sudo b2b-telegram off        отключить отправку (настройки сохраняются в .off)
# Токен бота и пароль архивов лежат в /etc/b2b-orders (только root): приложение их не видит.
set -euo pipefail
CONF_DIR=/etc/b2b-orders
CONF="$CONF_DIR/telegram.env"
PASS_FILE="$CONF_DIR/backup.pass"
TG_API="${TELEGRAM_API:-https://api.telegram.org}"
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo: sudo b2b-telegram ${1:-setup}" >&2; exit 1; }
install -d -m 700 "$CONF_DIR"

api() { # api МЕТОД [curl-параметры…] — токен через stdin, чтобы не светился в списке процессов
  local m=$1; shift
  printf 'url = "%s/bot%s/%s"\n' "$TG_API" "$TOKEN" "$m" | curl -sS -K - --max-time 20 "$@"
}
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(eval(process.argv[1])??"")})' "$1"; }

show_password() {
  echo
  echo "  ═══════════════════════════════════════════════════════════"
  echo "   Пароль архивов резервных копий:   $(cat "$PASS_FILE")"
  echo "   Сохраните его у себя (менеджер паролей, бумага в сейфе)."
  echo "   В Telegram он НЕ отправляется. Без него архивы из канала"
  echo "   не открыть, а если пропадёт сервер — пропадёт и пароль."
  echo "  ═══════════════════════════════════════════════════════════"
}

setup() {
  command -v 7z >/dev/null || command -v 7zz >/dev/null || {
    echo "==> Ставлю 7-Zip для зашифрованных архивов"
    apt-get install -y -q 7zip >/dev/null 2>&1 || apt-get install -y -q p7zip-full >/dev/null
  }
  echo "Нужен бот (создаётся в @BotFather командой /newbot) и канал, где бот — администратор."
  echo "Пошагово: docs/deploy.md, раздел 9."
  echo
  local old_token="" old_chat=""
  [ -r "$CONF" ] || [ ! -r "$CONF.off" ] || mv "$CONF.off" "$CONF"
  if [ -r "$CONF" ]; then old_token="$(. "$CONF"; echo "${TELEGRAM_BOT_TOKEN:-}")"; old_chat="$(. "$CONF"; echo "${TELEGRAM_CHAT_ID:-}")"; fi
  read -r -s -p "Токен бота от @BotFather${old_token:+ (Enter — оставить прежний)}: " TOKEN; echo
  TOKEN="${TOKEN:-$old_token}"
  [ -n "$TOKEN" ] || { echo "Токен не введён" >&2; exit 1; }
  local me; me="$(api getMe)"
  [ "$(json 'j.ok' <<<"$me")" = true ] || { echo "Telegram не принял токен. Проверьте его в @BotFather (/mybots → бот → API Token)." >&2; exit 1; }
  local bot; bot="$(json 'j.result.username' <<<"$me")"
  echo "  ✓ бот @$bot"

  local chat="${TELEGRAM_CHAT_ID:-}"
  if [ -z "$chat" ]; then
    echo
    echo "Добавьте @$bot в канал администратором (право «Публикация сообщений»),"
    read -r -p "затем напишите в канал любое сообщение и нажмите Enter${old_chat:+ (или Enter без сообщения — оставить $old_chat)}: " _
    local upd; upd="$(api getUpdates --data-urlencode 'allowed_updates=["channel_post","message","my_chat_member"]')"
    chat="$(json '[...j.result].reverse().map(u=>(u.channel_post||u.message||u.my_chat_member||{}).chat).filter(c=>c&&c.type!=="private").map(c=>c.id+"\t"+(c.title||"")).filter((v,i,a)=>a.indexOf(v)===i).join("\n")' <<<"$upd" || true)"
    if [ "$(printf '%s' "$chat" | grep -c .)" -gt 1 ]; then
      echo "Бот видит несколько чатов:"; printf '%s\n' "$chat" | nl -w2 -s') '
      read -r -p "Номер нужного: " n; chat="$(printf '%s\n' "$chat" | sed -n "${n}p")"
    fi
    if [ -n "$chat" ]; then echo "  ✓ канал «$(cut -f2 <<<"$chat")»"; chat="$(cut -f1 <<<"$chat")"
    elif [ -n "$old_chat" ]; then chat="$old_chat"
    else read -r -p "Канал не найден. Введите его id вручную (вида -1001234567890): " chat
    fi
  fi
  [[ "$chat" =~ ^-?[0-9]+$|^@[A-Za-z0-9_]{5,}$ ]] || { echo "Непохоже на id канала: $chat" >&2; exit 1; }

  umask 077
  local keep_send keep_max
  keep_send="$( [ -r "$CONF" ] && (. "$CONF"; echo "${TELEGRAM_SEND_BACKUPS:-1}") || echo 1)"
  keep_max="$( [ -r "$CONF" ] && (. "$CONF"; echo "${TELEGRAM_BACKUP_MAX_MB:-500}") || echo 500)"
  cat > "$CONF" <<ENV
# Telegram для логов и резервных копий (sudo b2b-telegram setup). Только root. В чат и git не копировать.
TELEGRAM_BOT_TOKEN="$TOKEN"
TELEGRAM_CHAT_ID="$chat"
# 0 — копии в канал не отправлять, только сообщение о них
TELEGRAM_SEND_BACKUPS="$keep_send"
# Фото больше этого размера (МБ) в канал не отправляются — только база и предупреждение
TELEGRAM_BACKUP_MAX_MB="$keep_max"
# Подпись сервера в сообщениях (по умолчанию домен из .env)
TELEGRAM_LABEL=""
ENV
  chmod 600 "$CONF"
  if [ ! -s "$PASS_FILE" ]; then
    openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24 > "$PASS_FILE"
    chmod 600 "$PASS_FILE"
    NEW_PASS=1
  fi
  rm -f "$CONF.off"

  systemctl daemon-reload
  systemctl enable --now b2b-orders-monitor.timer b2b-orders-daily.timer >/dev/null
  /usr/local/sbin/b2b-notify "✅ Канал подключён. Сюда будут приходить: падения и ошибки сайта, перезапуски, подбор паролей, место на диске, ежедневная сводка в 09:00 и зашифрованные резервные копии в 03:30." \
    && echo "  ✓ проверочное сообщение отправлено — посмотрите канал" \
    || { echo "Не удалось отправить в канал. Бот точно администратор канала? Повторите: sudo b2b-telegram setup" >&2; exit 1; }
  show_password
  [ -z "${NEW_PASS:-}" ] || echo "  (пароль новый — сохраните его сейчас; показать снова: sudo b2b-telegram password)"
  echo
  echo "Отправить резервную копию в канал прямо сейчас: sudo b2b-backup"
}

status() {
  if [ -r "$CONF" ]; then
    # shellcheck disable=SC1090
    . "$CONF"; TOKEN="$TELEGRAM_BOT_TOKEN"
    echo "Бот: @$(api getMe | json 'j.result&&j.result.username' || echo '?'), канал: $TELEGRAM_CHAT_ID"
    echo "Копии в канал: $([ "${TELEGRAM_SEND_BACKUPS:-1}" = 0 ] && echo нет || echo "да (фото до ${TELEGRAM_BACKUP_MAX_MB:-500} МБ)")"
  else
    echo "Telegram не подключён: sudo b2b-telegram setup"
  fi
  echo "Пароль архивов: $([ -s "$PASS_FILE" ] && echo есть || echo нет)"
  systemctl list-timers 'b2b-orders-*' --no-pager | head -n 5
}

case "${1:-setup}" in
  setup) setup ;;
  test) /usr/local/sbin/b2b-notify "👋 Проверка связи: $(date '+%d.%m.%Y %H:%M')" && echo "Отправлено" ;;
  status) status ;;
  password) [ -s "$PASS_FILE" ] && show_password || echo "Пароля нет: sudo b2b-telegram setup" ;;
  off) [ -f "$CONF" ] && mv "$CONF" "$CONF.off"; systemctl disable --now b2b-orders-monitor.timer b2b-orders-daily.timer >/dev/null 2>&1 || true
       echo "Отправка в Telegram выключена. Включить снова: sudo b2b-telegram setup" ;;
  *) sed -n '2,8p' "$0"; exit 2 ;;
esac
