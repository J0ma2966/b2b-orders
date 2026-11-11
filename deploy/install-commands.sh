#!/usr/bin/env bash
# Ставит серверные команды b2b-* и служебные таймеры из папки deploy. Запускают install.sh и b2b-update.
# b2b-update берёт этот файл из только что скачанного кода, поэтому новая команда, добавленная
# в список ниже, появляется на сервере после первого же обновления.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo" >&2; exit 1; }
cd "$(dirname "$(readlink -f "$0")")"

# файл в deploy/  →  команда в /usr/local/sbin
while read -r file cmd; do
  install -m 755 "$file" "/usr/local/sbin/$cmd"
done <<'LIST'
backup.sh           b2b-backup
update.sh           b2b-update
set-domain.sh       b2b-set-domain
notify.sh           b2b-notify
monitor.sh          b2b-monitor
telegram.sh         b2b-telegram
set-admin-phone.sh  b2b-set-admin-phone
support-mail.sh     b2b-support-mail
LIST

# Резервные копии (03:30), проверки (раз в 2 минуты), утренняя сводка (09:00)
for u in b2b-orders-backup b2b-orders-monitor b2b-orders-daily; do
  install -m 644 "$u.service" "/etc/systemd/system/$u.service"
  install -m 644 "$u.timer" "/etc/systemd/system/$u.timer"
done
systemctl daemon-reload
systemctl enable --now b2b-orders-backup.timer b2b-orders-monitor.timer b2b-orders-daily.timer >/dev/null 2>&1

# Правки nginx для уже установленных серверов (новые установки берут их из deploy/nginx.conf).
# Поддельный заголовок Next-Action от ботов-сканеров отсекаем до приложения: иначе ошибки в журнале и тревоги.
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/b2b-orders}"
if [ -f "$NGINX_SITE" ] && ! grep -q 'http_next_action' "$NGINX_SITE" && grep -q 'client_max_body_size' "$NGINX_SITE"; then
  cp -a "$NGINX_SITE" "$NGINX_SITE.bak"
  sed -i '0,/^\( *\)client_max_body_size/s//\1# Поддельный Next-Action от сканеров — сразу 400 (deploy\/nginx.conf)\n\1if ($http_next_action !~ "^([0-9a-f]{16,128})?$") { return 400; }\n\n&/' "$NGINX_SITE"
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx; rm -f "$NGINX_SITE.bak"
  else mv "$NGINX_SITE.bak" "$NGINX_SITE"; echo "! nginx не принял фильтр Next-Action, настройки не менялись" >&2; fi
fi
