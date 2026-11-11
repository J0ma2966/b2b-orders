#!/usr/bin/env bash
# Почта техподдержки: письма из ящика приходят суперадмину в раздел «Поддержка» и уведомлением.
#   sudo b2b-support-mail setup   — подключить ящик (адрес, пароль приложения), проверить вход, перезапустить сайт
#   sudo b2b-support-mail test    — проверить вход в ящик с текущими настройками
#   sudo b2b-support-mail status  — что подключено и последние записи журнала
#   sudo b2b-support-mail off     — отключить (письма, уже сохранённые на платформе, остаются)
# Ящик открывается только для чтения: письма не удаляются и не помечаются прочитанными.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/b2b-orders}"
APP_USER="${APP_USER:-b2b}"
ENV_FILE="$APP_DIR/.env"
PASS_FILE="$APP_DIR/secrets/support-mail.pass"
SERVICE="${SERVICE:-b2b-orders}"
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo: sudo b2b-support-mail ${1:-setup}" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Не найден $ENV_FILE" >&2; exit 1; }

get_env() { grep -oP "^$1=\"?\K[^\"]*" "$ENV_FILE" 2>/dev/null | tail -1 || true; }
set_env() { # set_env KEY VALUE (значения здесь без кавычек и спецсимволов: адрес, сервер, порт, путь)
  if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=\"$2\"|" "$ENV_FILE"; else echo "$1=\"$2\"" >> "$ENV_FILE"; fi
}

# IMAP-сервер по адресу ящика: известные почтовые службы, иначе по MX-записи домена
guess_host() {
  local domain="${1##*@}" mx=""
  case "$domain" in
    gmail.com|googlemail.com) echo imap.gmail.com; return ;;
    yandex.ru|yandex.uz|ya.ru|yandex.com) echo imap.yandex.ru; return ;;
    mail.ru|bk.ru|inbox.ru|list.ru) echo imap.mail.ru; return ;;
    outlook.com|hotmail.com|live.com) echo outlook.office365.com; return ;;
  esac
  command -v dig >/dev/null && mx="$(dig +short MX "$domain" 2>/dev/null | tr 'A-Z' 'a-z')"
  case "$mx" in
    *yandex*) echo imap.yandex.ru ;;
    *google*) echo imap.gmail.com ;;
    *mail.ru*) echo imap.mail.ru ;;
    *outlook*) echo outlook.office365.com ;;
    *zoho*) echo imap.zoho.com ;;
    *) echo "mail.$domain" ;;
  esac
}

# Вход в ящик через curl (пароль передаётся через stdin, а не в командной строке)
try_login() { # try_login HOST PORT USER PASSWORD MAILBOX
  local esc_user esc_pass scheme=imaps
  [ "$2" = 993 ] || scheme=imap
  esc_user="$(printf '%s' "$3" | sed 's/[\\"]/\\&/g')"
  esc_pass="$(printf '%s' "$4" | sed 's/[\\"]/\\&/g')"
  printf 'user = "%s:%s"\n' "$esc_user" "$esc_pass" |
    curl -sS --max-time 25 --config - --url "$scheme://$1:$2/" -X "EXAMINE \"$5\"" -o /dev/null 2>&1
}

restart_app() {
  systemctl restart "$SERVICE"
  echo "Сайт перезапущен. Первая проверка почты — примерно через 20 секунд."
}

cmd_setup() {
  local user host port pass mailbox err
  user="$(get_env SUPPORT_IMAP_USER)"
  read -r -p "Адрес ящика поддержки${user:+ [$user]}: " ans; user="${ans:-$user}"
  [[ "$user" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo "Нужен адрес почты, например support@optolink.uz" >&2; exit 1; }
  host="$(get_env SUPPORT_IMAP_HOST)"; [ -n "$host" ] || host="$(guess_host "$user")"
  read -r -p "IMAP-сервер [$host]: " ans; host="${ans:-$host}"
  [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Неверный адрес сервера" >&2; exit 1; }
  port="$(get_env SUPPORT_IMAP_PORT)"; port="${port:-993}"
  read -r -p "Порт [$port]: " ans; port="${ans:-$port}"
  [[ "$port" =~ ^[0-9]+$ ]] || { echo "Порт — число, обычно 993" >&2; exit 1; }
  mailbox="$(get_env SUPPORT_IMAP_MAILBOX)"; mailbox="${mailbox:-INBOX}"
  echo "Пароль приложения (для Яндекса и Gmail — не обычный пароль, а «пароль приложения»; ввод не виден):"
  read -r -s pass; echo
  [ -n "$pass" ] || { echo "Пароль пустой" >&2; exit 1; }

  echo "Проверяю вход в $user на $host:$port…"
  if ! err="$(try_login "$host" "$port" "$user" "$pass" "$mailbox")"; then
    echo "Не удалось войти: ${err:-нет ответа}" >&2
    echo "Проверьте адрес, пароль приложения и что в настройках ящика включён доступ по IMAP. Настройки не изменены." >&2
    exit 1
  fi
  echo "Вход в ящик работает."

  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/secrets"
  ( umask 077; printf '%s' "$pass" > "$PASS_FILE" )
  chown "$APP_USER:$APP_USER" "$PASS_FILE"; chmod 600 "$PASS_FILE"
  set_env SUPPORT_IMAP_HOST "$host"
  set_env SUPPORT_IMAP_PORT "$port"
  set_env SUPPORT_IMAP_USER "$user"
  set_env SUPPORT_IMAP_PASSWORD ""
  set_env SUPPORT_IMAP_PASSWORD_FILE "$PASS_FILE"
  restart_app
  echo "Готово. Письма появятся в кабинете суперадмина: раздел «Поддержка» (/admin/support)."
}

cmd_test() {
  local host user port pass mailbox err pf
  host="$(get_env SUPPORT_IMAP_HOST)"; user="$(get_env SUPPORT_IMAP_USER)"
  port="$(get_env SUPPORT_IMAP_PORT)"; port="${port:-993}"
  mailbox="$(get_env SUPPORT_IMAP_MAILBOX)"; mailbox="${mailbox:-INBOX}"
  pf="$(get_env SUPPORT_IMAP_PASSWORD_FILE)"
  [ -n "$host" ] && [ -n "$user" ] || { echo "Почта поддержки не подключена: sudo b2b-support-mail setup"; exit 1; }
  if [ -n "$pf" ] && [ -f "$pf" ]; then pass="$(cat "$pf")"; else pass="$(get_env SUPPORT_IMAP_PASSWORD)"; fi
  if err="$(try_login "$host" "$port" "$user" "$pass" "$mailbox")"; then echo "Вход в $user на $host:$port работает."
  else echo "Не удалось войти в $user на $host:$port: ${err:-нет ответа}" >&2; exit 1; fi
}

cmd_status() {
  local host user
  host="$(get_env SUPPORT_IMAP_HOST)"; user="$(get_env SUPPORT_IMAP_USER)"
  if [ -z "$host" ] || [ -z "$user" ]; then echo "Почта поддержки не подключена: sudo b2b-support-mail setup"; return; fi
  echo "Ящик:   $user"
  echo "Сервер: $host:$(get_env SUPPORT_IMAP_PORT)"
  echo "Последние записи журнала о почте:"
  journalctl -u "$SERVICE" --since "-1 day" --no-pager -o cat 2>/dev/null | grep '\[support-mail\]' | tail -5 || true
  echo "(пусто — значит ошибок не было; статус проверки виден и в кабинете: /admin/support)"
}

cmd_off() {
  set_env SUPPORT_IMAP_HOST ""
  set_env SUPPORT_IMAP_USER ""
  set_env SUPPORT_IMAP_PASSWORD ""
  set_env SUPPORT_IMAP_PASSWORD_FILE ""
  rm -f "$PASS_FILE"
  restart_app
  echo "Почта поддержки отключена. Уже полученные письма остались в разделе «Поддержка»."
}

case "${1:-setup}" in
  setup) cmd_setup ;;
  test) cmd_test ;;
  status) cmd_status ;;
  off) cmd_off ;;
  *) echo "Использование: sudo b2b-support-mail setup|test|status|off" >&2; exit 1 ;;
esac
