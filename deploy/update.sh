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
for _ in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3000/login && break; sleep 2; done
curl -fsS -o /dev/null http://127.0.0.1:3000/login && echo "Готово: работает $NEW" || { echo "Сайт не отвечает: sudo journalctl -u b2b-orders -n 50" >&2; exit 1; }

# Скрипты из репозитория могли измениться — ставим свежие
install -m 755 deploy/backup.sh /usr/local/sbin/b2b-backup
install -m 755 deploy/update.sh /usr/local/sbin/b2b-update
