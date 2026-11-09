#!/usr/bin/env bash
# Обновление до свежего кода из GitHub: копия базы → git pull → зависимости → миграции → сборка → перезапуск.
#   sudo b2b-update            (ветка main)
#   sudo BRANCH=… b2b-update   (другая ветка, например для проверки PR)
# Сборка идёт на месте: пока она идёт (2–5 минут), часть страниц может отвечать ошибкой.
# Обновляйте в спокойное время (вечером). Если сборка упала — сайт поднимется после исправления и повторного запуска.
set -euo pipefail
APP_DIR=/opt/b2b-orders
APP_USER=b2b
BRANCH="${BRANCH:-main}"
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo: sudo b2b-update" >&2; exit 1; }
cd "$APP_DIR"
as_app() { sudo -u "$APP_USER" "$@"; }
notify() { [ -x /usr/local/sbin/b2b-notify ] && /usr/local/sbin/b2b-notify "$@" || true; }
# На время сборки сайт может не отвечать — проверки не тревожат 30 минут; итог обновления придёт в Telegram
[ -x /usr/local/sbin/b2b-monitor ] && /usr/local/sbin/b2b-monitor maintenance 30 || true
trap 'notify "❌ Обновление не удалось (строка $LINENO). Подробно: запустите sudo b2b-update ещё раз и посмотрите вывод"; [ -x /usr/local/sbin/b2b-monitor ] && /usr/local/sbin/b2b-monitor maintenance 0 || true' ERR

echo "==> Резервная копия перед обновлением"
/usr/local/sbin/b2b-backup

echo "==> Код ($BRANCH)"
OLD="$(as_app git rev-parse --short HEAD)"
as_app git fetch --quiet origin "$BRANCH"
as_app git checkout --quiet "$BRANCH"
as_app git merge --ff-only --quiet "origin/$BRANCH"
NEW="$(as_app git rev-parse --short HEAD)"
echo "   $OLD → $NEW"
as_app git log --oneline "$OLD..$NEW" | head -20

echo "==> Зависимости, миграции, сборка"
as_app npm ci --no-audit --no-fund
as_app npm run db:deploy
as_app npm run build
echo "==> Перезапуск"
systemctl restart b2b-orders
for _ in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3000/login 2>/dev/null && break; sleep 2; done
curl -fsS -o /dev/null http://127.0.0.1:3000/login && echo "Готово: работает $NEW" || { echo "Сайт не отвечает: sudo journalctl -u b2b-orders -n 50" >&2; exit 1; }

# Скрипты и таймеры из репозитория могли измениться — ставим свежие
install -m 755 deploy/backup.sh /usr/local/sbin/b2b-backup
install -m 755 deploy/update.sh /usr/local/sbin/b2b-update
install -m 755 deploy/set-domain.sh /usr/local/sbin/b2b-set-domain
install -m 755 deploy/notify.sh /usr/local/sbin/b2b-notify
install -m 755 deploy/monitor.sh /usr/local/sbin/b2b-monitor
install -m 755 deploy/telegram.sh /usr/local/sbin/b2b-telegram
install -m 755 deploy/set-admin-phone.sh /usr/local/sbin/b2b-set-admin-phone
command -v 7z >/dev/null || command -v 7zz >/dev/null || apt-get install -y -q 7zip >/dev/null 2>&1 || apt-get install -y -q p7zip-full >/dev/null 2>&1 || true
for u in b2b-orders-backup b2b-orders-monitor b2b-orders-daily; do
  install -m 644 "deploy/$u.service" "/etc/systemd/system/$u.service"
  install -m 644 "deploy/$u.timer" "/etc/systemd/system/$u.timer"
done
systemctl daemon-reload
systemctl enable --now b2b-orders-monitor.timer b2b-orders-daily.timer >/dev/null 2>&1
/usr/local/sbin/b2b-monitor maintenance 0
echo "$(date '+%d.%m %H:%M') · $OLD → $NEW" > /var/lib/b2b-orders-monitor/update_info
notify --quiet "⬆️ Платформа обновлена: $OLD → $NEW
$(as_app git log --oneline "$OLD..$NEW" | head -10)"
