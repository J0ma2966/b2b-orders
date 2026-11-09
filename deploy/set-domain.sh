#!/usr/bin/env bash
# Переезд на свой домен (или смена домена) после установки:
#   sudo b2b-set-domain app.example.uz [почта-для-letsencrypt]
# Сначала в панели регистратора домена сделайте A-запись app.example.uz → IP сервера и подождите,
# пока она заработает (проверка: ping app.example.uz показывает IP сервера).
set -euo pipefail
APP_DIR=/opt/b2b-orders
DOMAIN="${1:-}"; EMAIL="${2:-}"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo" >&2; exit 1; }
[ -n "$DOMAIN" ] || { echo "Укажите домен: sudo b2b-set-domain app.example.uz" >&2; exit 1; }

IP="$(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || true)"
RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}')"
if [ -n "$IP" ] && [ "$RESOLVED" != "$IP" ]; then
  echo "! $DOMAIN сейчас указывает на «${RESOLVED:-никуда}», а IP сервера $IP. Проверьте A-запись и повторите позже." >&2
  exit 1
fi

set_env() { # set_env KEY VALUE
  if grep -q "^$1=" "$APP_DIR/.env"; then sed -i "s|^$1=.*|$1=\"$2\"|" "$APP_DIR/.env"; else echo "$1=\"$2\"" >> "$APP_DIR/.env"; fi
}
[ -n "$EMAIL" ] || EMAIL="$(grep -oP '^CERTBOT_EMAIL="?\K[^"]*' "$APP_DIR/.env" || true)"
set_env APP_DOMAIN "$DOMAIN"
set_env CERTBOT_EMAIL "$EMAIL"
set_env COOKIE_SECURE ""

command -v certbot >/dev/null || apt-get install -y -q certbot python3-certbot-nginx
sed "s/__SERVER_NAME__/$DOMAIN/g; s/__PORT__/3000/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/b2b-orders
[ -e /proc/net/if_inet6 ] || sed -i '/listen \[::\]:80;/d' /etc/nginx/sites-available/b2b-orders
nginx -t && systemctl reload nginx
if [ -n "$EMAIL" ]; then CERT_MAIL=(-m "$EMAIL"); else CERT_MAIL=(--register-unsafely-without-email); fi
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${CERT_MAIL[@]}" --redirect --hsts
systemctl restart b2b-orders
echo "Готово: https://$DOMAIN"
echo "Не забудьте: в GitHub поменять переменную MOBILE_SERVER_URL на https://$DOMAIN и раздать новый APK (docs/deploy.md)."
