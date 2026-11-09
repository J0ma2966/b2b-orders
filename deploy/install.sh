#!/usr/bin/env bash
# Установка платформы на чистый сервер Ubuntu 22.04 / 24.04 одной командой (docs/deploy.md).
#
#   sudo bash install.sh
#
# Скрипт спросит домен, почту и данные владельца платформы. Можно передать их заранее:
#   sudo DOMAIN=app.example.uz EMAIL=admin@example.uz bash install.sh
# Пока своего домена нет, берётся бесплатный адрес 1-2-3-4.sslip.io (он всегда указывает на IP 1.2.3.4),
# и для него тоже выпускается настоящий сертификат HTTPS. Свой домен потом — docs/deploy.md.
# DOMAIN=none — совсем без домена и HTTPS, по http://IP (только для проверки).
#
# Что делает: Node.js 22, PostgreSQL, nginx, сертификат Let's Encrypt, пользователь b2b,
# код в /opt/b2b-orders, база с случайным паролем, .env с ключами push и CRON_SECRET,
# миграции, территории и супер-админ, сборка, служба systemd, ежедневные резервные копии, проверки для Telegram, firewall.
# Повторный запуск безопасен: существующие .env, база и пароли не трогаются.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/J0ma2966/b2b-orders.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/b2b-orders
DATA_DIR=/var/lib/b2b-orders
BACKUP_DIR=/var/backups/b2b-orders
APP_USER=b2b
DB_NAME=b2b
PORT=3000

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\n\033[31mОшибка: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "запустите через sudo: sudo bash install.sh"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || [ "${ID:-}" = debian ] || die "нужна Ubuntu 22.04/24.04 (или Debian 12), а здесь ${PRETTY_NAME:-неизвестная система}"

ask() { # ask VAR "Вопрос" [по умолчанию]
  local var=$1 q=$2 def=${3:-}
  if [ -z "${!var:-}" ] && [ -t 0 ]; then
    read -r -p "$q${def:+ [$def]}: " "$var" || true
  fi
  [ -n "${!var:-}" ] || printf -v "$var" '%s' "$def"
}

public_ip() { curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}'; }

if [ ! -f "$APP_DIR/.env" ]; then
  say "Настройки"
  SSLIP="$(public_ip | tr . -).sslip.io"
  ask DOMAIN "Домен платформы (Enter — бесплатный адрес $SSLIP)" "$SSLIP"
  DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
  [ "$DOMAIN" != none ] || DOMAIN=""
  [ -z "$DOMAIN" ] || ask EMAIL "Почта для Let's Encrypt (напоминания о сертификате; можно пусто)"
  ask SUPERADMIN_PHONE "Телефон супер-админа" "+998900000000"
  ask LEGAL_OPERATOR_NAME "Владелец платформы для страницы конфиденциальности (ИП/ООО)"
  ask LEGAL_CONTACT_EMAIL "Почта для связи" "${EMAIL:-}"
  ask LEGAL_CONTACT_PHONE "Телефон для связи"
else
  DOMAIN="$(grep -oP '^APP_DOMAIN="?\K[^"]*' "$APP_DIR/.env" || true)"
  EMAIL="${EMAIL:-$(grep -oP '^CERTBOT_EMAIL="?\K[^"]*' "$APP_DIR/.env" || true)}"
  ok ".env уже есть — настройки берутся из него"
fi

# У части VPS IPv6 есть в системе, но не ведёт в интернет: curl, apt и npm тогда зависают.
# Если по IPv6 GitHub недоступен, а по IPv4 доступен, просим систему предпочитать IPv4.
if ! curl -6 -fsS -o /dev/null --max-time 6 https://github.com 2>/dev/null \
   && curl -4 -fsS -o /dev/null --max-time 10 https://github.com 2>/dev/null \
   && ! grep -q '^precedence ::ffff:0:0/96' /etc/gai.conf 2>/dev/null; then
  echo 'precedence ::ffff:0:0/96  100' >> /etc/gai.conf
  ok "IPv6 не работает — сервер будет ходить в интернет по IPv4"
fi

say "Системные пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git gnupg nginx postgresql ufw openssl
# 7-Zip — зашифрованные архивы резервных копий для Telegram (на Ubuntu 22.04 пакет называется p7zip-full)
apt-get install -y -q 7zip 2>/dev/null || apt-get install -y -q p7zip-full
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
ok "Node.js $(node -v), $(psql --version | head -1)"
if [ -n "$DOMAIN" ]; then apt-get install -y -q certbot python3-certbot-nginx; fi

# Сборке Next.js нужно ~2 ГБ памяти; на маленьком сервере добавляем файл подкачки
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && ! swapon --show | grep -q .; then
  say "Файл подкачки 2 ГБ (памяти ${MEM_MB} МБ)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "подкачка включена"
fi

say "Пользователь и каталоги"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP_USER --shell /bin/bash "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR" "$DATA_DIR/uploads"
install -d -o root -g root -m 700 "$BACKUP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$APP_DIR/secrets"
ok "код в $APP_DIR ($(sudo -u "$APP_USER" git -C "$APP_DIR" log --oneline -1))"

say "База данных PostgreSQL"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$APP_USER'" | grep -q 1; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  sudo -u postgres psql -q -c "CREATE ROLE $APP_USER LOGIN PASSWORD '$DB_PASSWORD'"
  NEW_DB_PASSWORD=1
fi
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres createdb -O "$APP_USER" "$DB_NAME"
ok "база $DB_NAME, владелец $APP_USER (только локальные подключения)"

if [ ! -f "$APP_DIR/.env" ]; then
  say "Файл настроек .env"
  [ "${NEW_DB_PASSWORD:-}" = 1 ] || die "пользователь базы $APP_USER уже есть, а .env нет. Задайте пароль: sudo -u postgres psql -c \"ALTER ROLE $APP_USER PASSWORD 'новый'\" и впишите DATABASE_URL в $APP_DIR/.env по образцу .env.example"
  VAPID_JSON="$(cd /tmp && npx --yes web-push@3 generate-vapid-keys --json)"
  VAPID_PUBLIC="$(node -e 'console.log(JSON.parse(process.argv[1]).publicKey)' "$VAPID_JSON")"
  VAPID_PRIVATE="$(node -e 'console.log(JSON.parse(process.argv[1]).privateKey)' "$VAPID_JSON")"
  umask 077
  cat > "$APP_DIR/.env" <<ENV
# Создан deploy/install.sh $(date -u +%F). Пароли и ключи — только здесь, в чат и git не копировать.
APP_DOMAIN="$DOMAIN"
CERTBOT_EMAIL="${EMAIL:-}"
DATABASE_URL="postgresql://$APP_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?schema=public"
UPLOAD_DIR="$DATA_DIR/uploads"
SUPERADMIN_PHONE="$SUPERADMIN_PHONE"
SUPERADMIN_PASSWORD=""
VAPID_PUBLIC_KEY="$VAPID_PUBLIC"
VAPID_PRIVATE_KEY="$VAPID_PRIVATE"
VAPID_SUBJECT="mailto:${LEGAL_CONTACT_EMAIL:-${EMAIL:-admin@example.uz}}"
JOBS_DISABLED=""
CRON_SECRET="$(openssl rand -hex 32)"
# Push в Android-приложении: положите ключ Firebase в /opt/b2b-orders/secrets/ и укажите путь (docs/deploy.md)
FCM_SERVICE_ACCOUNT=""
FCM_SERVICE_ACCOUNT_FILE=""
APNS_KEY=""
APNS_KEY_FILE=""
APNS_KEY_ID=""
APNS_TEAM_ID=""
APNS_BUNDLE_ID="uz.b2borders.app"
APNS_PRODUCTION=""
LEGAL_OPERATOR_NAME="${LEGAL_OPERATOR_NAME:-}"
LEGAL_CONTACT_EMAIL="${LEGAL_CONTACT_EMAIL:-}"
LEGAL_CONTACT_PHONE="${LEGAL_CONTACT_PHONE:-}"
# Без домена сайт открывается по http://IP — cookie входа без флага Secure. С доменом и HTTPS оставить пустым
COOKIE_SECURE="$([ -n "$DOMAIN" ] || echo 0)"
ENV
  umask 022
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"
  ok ".env создан (пароль базы, ключи VAPID, CRON_SECRET сгенерированы)"
fi

say "Сборка (несколько минут)"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --no-audit --no-fund
sudo -u "$APP_USER" npm run db:deploy
SEED_OUT="$(sudo -u "$APP_USER" npm run db:seed 2>&1)"; echo "$SEED_OUT" | tail -n 15
sudo -u "$APP_USER" npm run build
ok "сборка готова"

say "Служба systemd"
install -m 644 "$APP_DIR/deploy/b2b-orders.service" /etc/systemd/system/b2b-orders.service
install -m 644 "$APP_DIR/deploy/b2b-orders-backup.service" /etc/systemd/system/b2b-orders-backup.service
for u in b2b-orders-backup b2b-orders-monitor b2b-orders-daily; do
  install -m 644 "$APP_DIR/deploy/$u.service" "/etc/systemd/system/$u.service"
  install -m 644 "$APP_DIR/deploy/$u.timer" "/etc/systemd/system/$u.timer"
done
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/sbin/b2b-backup
install -m 755 "$APP_DIR/deploy/update.sh" /usr/local/sbin/b2b-update
install -m 755 "$APP_DIR/deploy/set-domain.sh" /usr/local/sbin/b2b-set-domain
install -m 755 "$APP_DIR/deploy/notify.sh" /usr/local/sbin/b2b-notify
install -m 755 "$APP_DIR/deploy/monitor.sh" /usr/local/sbin/b2b-monitor
install -m 755 "$APP_DIR/deploy/telegram.sh" /usr/local/sbin/b2b-telegram
systemctl daemon-reload
# Проверки и сводка работают и без Telegram (тогда просто молчат), а после sudo b2b-telegram setup пишут в канал
systemctl enable --now b2b-orders.service b2b-orders-backup.timer b2b-orders-monitor.timer b2b-orders-daily.timer
systemctl restart b2b-orders.service
for _ in $(seq 1 30); do curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login" 2>/dev/null && break; sleep 2; done
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login" || die "приложение не отвечает: journalctl -u b2b-orders -n 50"
ok "приложение работает на 127.0.0.1:$PORT"

say "nginx"
SERVER_NAME="${DOMAIN:-_}"
sed "s/__SERVER_NAME__/$SERVER_NAME/g; s/__PORT__/$PORT/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/b2b-orders
# Сервер без IPv6 — убираем строку listen [::]:80, иначе nginx не запустится
[ -e /proc/net/if_inet6 ] || sed -i '/listen \[::\]:80;/d' /etc/nginx/sites-available/b2b-orders
ln -sf /etc/nginx/sites-available/b2b-orders /etc/nginx/sites-enabled/b2b-orders
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "nginx настроен"

say "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ok "открыты только SSH, 80 и 443"

if [ -n "$DOMAIN" ]; then
  say "Сертификат HTTPS для $DOMAIN"
  if [ -n "${EMAIL:-}" ]; then CERT_MAIL=(-m "$EMAIL"); else CERT_MAIL=(--register-unsafely-without-email); fi
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${CERT_MAIL[@]}" --redirect --hsts; then
    ok "HTTPS включён, сертификат продлевается сам"
  else
    printf '\n\033[33m! Сертификат не получен. Проверьте, что A-запись %s указывает на IP этого сервера,\n  и повторите: sudo certbot --nginx -d %s --redirect --hsts\033[0m\n' "$DOMAIN" "$DOMAIN"
  fi
fi

say "Первая резервная копия"
/usr/local/sbin/b2b-backup && ok "копии в $BACKUP_DIR, дальше каждую ночь в 03:30"

IP="$(public_ip)"
say "Готово"
if [ -n "$DOMAIN" ]; then SITE_URL="https://$DOMAIN"; else SITE_URL="http://$IP"; fi
echo "  Адрес:        $SITE_URL"
echo "  Супер-админ:  $(grep -oP '^SUPERADMIN_PHONE="?\K[^"]*' "$APP_DIR/.env")"
if echo "$SEED_OUT" | grep -qi 'парол'; then
  echo "  Временный пароль супер-админа (показан один раз, при входе попросит сменить):"
  echo "$SEED_OUT" | grep -i 'парол' | sed 's/^/    /'
fi
echo "  Обновление:   sudo b2b-update"
if [ -s /etc/b2b-orders/telegram.env ]; then echo "  Telegram:     подключён (sudo b2b-telegram status)"
else echo "  Telegram:     логи и копии в канал — sudo b2b-telegram setup (docs/deploy.md, раздел 9)"; fi
echo "  Журнал:       sudo journalctl -u b2b-orders -f"
