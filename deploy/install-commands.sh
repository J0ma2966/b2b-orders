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
LIST

# Резервные копии (03:30), проверки (раз в 2 минуты), утренняя сводка (09:00)
for u in b2b-orders-backup b2b-orders-monitor b2b-orders-daily; do
  install -m 644 "$u.service" "/etc/systemd/system/$u.service"
  install -m 644 "$u.timer" "/etc/systemd/system/$u.timer"
done
systemctl daemon-reload
systemctl enable --now b2b-orders-backup.timer b2b-orders-monitor.timer b2b-orders-daily.timer >/dev/null 2>&1
