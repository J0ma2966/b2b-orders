#!/usr/bin/env bash
# Переезд на свой домен (или смена домена) после установки:
#   sudo b2b-set-domain optolink.uz [почта-для-letsencrypt]
# Сначала у регистратора домена сделайте A-записи «@» и «www» → IP сервера и подождите,
# пока они заработают (проверка: ping optolink.uz показывает IP сервера).
# Что делает:
#  - сертификат HTTPS для домена (и для www, если www тоже указывает на сервер), www → основной адрес;
#  - старый адрес (например 1-2-3-4.sslip.io) переадресует на новый, ссылки и закладки не ломаются;
#  - переподключает бота входа в Telegram к новому адресу, если он настроен.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/b2b-orders}"
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"
LE_DIR="${LE_DIR:-/etc/letsencrypt}"
DOMAIN="${1:-}"; EMAIL="${2:-}"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN,,}"
DOMAIN="${DOMAIN#www.}"   # основной адрес — без www, www переадресуем на него
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo" >&2; exit 1; }
[ -n "$DOMAIN" ] || { echo "Укажите домен: sudo b2b-set-domain optolink.uz" >&2; exit 1; }
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "Непохоже на домен: $DOMAIN" >&2; exit 1; }

IP="${SERVER_IP:-$(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || true)}"
a_records() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u | paste -sd' ' - || true; }
aaaa_records() { getent ahostsv6 "$1" 2>/dev/null | awk '{print $1}' | grep -v '^::ffff:' | sort -u | paste -sd' ' - || true; }
my_ipv6() { ip -6 addr show scope global 2>/dev/null | awk '/inet6/ {sub(/\/.*/, "", $2); print $2}'; }
# Домен указывает только на этот сервер: все A-записи = IP сервера, AAAA нет или они тоже наши.
# Чужая запись (например, заглушка регистратора) сорвёт выдачу сертификата.
points_here() {
  local a aaaa x; a="$(a_records "$1")"; aaaa="$(aaaa_records "$1")"
  [ -n "$a" ] || return 1
  [ -z "$IP" ] || [ "$a" = "$IP" ] || return 1
  for x in $aaaa; do my_ipv6 | grep -qx "$x" || return 1; done
}
if ! points_here "$DOMAIN"; then
  echo "! $DOMAIN пока не указывает на этот сервер (${IP:-IP не определён})." >&2
  a="$(a_records "$DOMAIN")"; aaaa="$(aaaa_records "$DOMAIN")"
  echo "  Сейчас у домена: A ${a:-нет}; AAAA ${aaaa:-нет}" >&2
  echo "  У регистратора: A-запись «@» → ${IP:-IP сервера}, другие A и AAAA удалить. Повторите через 10–30 минут." >&2
  exit 1
fi
WWW=""
if points_here "www.$DOMAIN"; then WWW="www.$DOMAIN"
else echo "  www.$DOMAIN не указывает на сервер — подключаю только $DOMAIN (www можно добавить позже, повторив команду)"; fi

set_env() { # set_env KEY VALUE
  if grep -q "^$1=" "$APP_DIR/.env"; then sed -i "s|^$1=.*|$1=\"$2\"|" "$APP_DIR/.env"; else echo "$1=\"$2\"" >> "$APP_DIR/.env"; fi
}
OLD="$(grep -oP '^APP_DOMAIN="?\K[^"]*' "$APP_DIR/.env" || true)"
[ -n "$EMAIL" ] || EMAIL="$(grep -oP '^CERTBOT_EMAIL="?\K[^"]*' "$APP_DIR/.env" || true)"

command -v certbot >/dev/null || apt-get install -y -q certbot python3-certbot-nginx

# Основной сайт: шаблон deploy/nginx.conf, имена домена (и www). Прежний файл — в запас:
# если сертификат не выдадут, вернём всё как было и сайт продолжит работать по старому адресу.
CONF="$NGINX_DIR/sites-available/b2b-orders"
cp -a "$CONF" "$CONF.bak" 2>/dev/null || true
restore() {
  echo "! $1 Возвращаю прежние настройки, сайт работает по старому адресу." >&2
  if [ -e "$CONF.bak" ]; then mv "$CONF.bak" "$CONF"; fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  exit 1
}
sed "s/__SERVER_NAME__/$DOMAIN${WWW:+ $WWW}/g; s/__PORT__/3000/g" "$APP_DIR/deploy/nginx.conf" > "$CONF.new"
[ -e /proc/net/if_inet6 ] || sed -i '/listen \[::\]:80;/d' "$CONF.new"
if [ -n "$WWW" ]; then
  # www → основной адрес; проверки Let's Encrypt не трогаем, иначе сертификат для www не выдадут
  S="    # $WWW → $DOMAIN
    set \$to_main 0;
    if (\$host = $WWW) { set \$to_main 1; }
    if (\$request_uri ~ \"^/.well-known/acme-challenge/\") { set \$to_main 0; }
    if (\$to_main) { return 301 https://$DOMAIN\$request_uri; }" \
    awk '{ print } /server_name / && !done { print ENVIRON["S"]; done = 1 }' "$CONF.new" > "$CONF.tmp"
  mv "$CONF.tmp" "$CONF.new"
fi
mv "$CONF.new" "$CONF"
ln -sf "$CONF" "$NGINX_DIR/sites-enabled/b2b-orders"
nginx -t || restore "nginx не принял настройки."
systemctl reload nginx

if [ -n "$EMAIL" ]; then CERT_MAIL=(-m "$EMAIL"); else CERT_MAIL=(--register-unsafely-without-email); fi
certbot --nginx --cert-name "$DOMAIN" -d "$DOMAIN" ${WWW:+-d "$WWW"} --non-interactive --agree-tos "${CERT_MAIL[@]}" --redirect --hsts \
  || restore "Сертификат для $DOMAIN не выдан (выше причина от Let's Encrypt)."
rm -f "$CONF.bak"

# Прежние адреса переадресуем на новый (по файлу на адрес, цель — всегда текущий домен)
rm -f "$NGINX_DIR/sites-enabled/b2b-old-$DOMAIN" "$NGINX_DIR/sites-available/b2b-old-$DOMAIN"
for f in "$NGINX_DIR"/sites-available/b2b-old-*; do
  [ -e "$f" ] && sed -i "s|return 301 https://[^\$]*\$request_uri;|return 301 https://$DOMAIN\$request_uri;|" "$f"
done
if [ -n "$OLD" ] && [ "$OLD" != "$DOMAIN" ] && [ "$OLD" != "www.$DOMAIN" ]; then
  V6=""; [ -e /proc/net/if_inet6 ] && V6=1
  {
    echo "# Прежний адрес платформы: переадресация на https://$DOMAIN (b2b-set-domain)"
    echo "server {"
    echo "    listen 80;"; [ -n "$V6" ] && echo "    listen [::]:80;"
    echo "    server_name $OLD;"
    echo "    location / { return 301 https://$DOMAIN\$request_uri; }"
    echo "}"
    if [ -s "$LE_DIR/live/$OLD/fullchain.pem" ]; then
      echo "server {"
      echo "    listen 443 ssl;"; [ -n "$V6" ] && echo "    listen [::]:443 ssl;"
      echo "    server_name $OLD;"
      echo "    ssl_certificate $LE_DIR/live/$OLD/fullchain.pem;"
      echo "    ssl_certificate_key $LE_DIR/live/$OLD/privkey.pem;"
      [ -s "$LE_DIR/options-ssl-nginx.conf" ] && echo "    include $LE_DIR/options-ssl-nginx.conf;"
      [ -s "$LE_DIR/ssl-dhparams.pem" ] && echo "    ssl_dhparam $LE_DIR/ssl-dhparams.pem;"
      echo "    location / { return 301 https://$DOMAIN\$request_uri; }"
      echo "}"
    fi
  } > "$NGINX_DIR/sites-available/b2b-old-$OLD"
  ln -sf "$NGINX_DIR/sites-available/b2b-old-$OLD" "$NGINX_DIR/sites-enabled/b2b-old-$OLD"
fi
if nginx -t; then systemctl reload nginx
else
  echo "! Переадресация со старого адреса не принята nginx — убираю её, новый адрес работает." >&2
  rm -f "$NGINX_DIR/sites-enabled/b2b-old-$OLD"; systemctl reload nginx
fi

set_env APP_DOMAIN "$DOMAIN"
set_env CERTBOT_EMAIL "$EMAIL"
set_env COOKIE_SECURE ""

# Бот входа в Telegram получает сообщения по адресу сайта — переключаем его на новый
if grep -qE '^TELEGRAM_LOGIN_BOT_TOKEN="?[0-9]+:' "$APP_DIR/.env"; then
  (cd "$APP_DIR" && sudo -u b2b npm run --silent telegram:login) \
    || echo "! Бот входа не переключился. Повторите: cd $APP_DIR && sudo -u b2b npm run telegram:login" >&2
fi
systemctl restart b2b-orders

echo
echo "Готово: https://$DOMAIN${WWW:+ (и $WWW → $DOMAIN)}"
[ -z "$OLD" ] || [ "$OLD" = "$DOMAIN" ] || echo "Старый адрес $OLD теперь переадресует на новый."
echo "Дальше: в GitHub поменять переменную MOBILE_SERVER_URL на https://$DOMAIN и раздать новый APK (docs/deploy.md, раздел 10)."
echo "Войти на новом адресе придётся заново: вход привязан к адресу сайта."
