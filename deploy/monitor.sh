#!/usr/bin/env bash
# Наблюдение за платформой с отправкой в Telegram (docs/deploy.md раздел 9).
#   b2b-monitor check    раз в 2 минуты (таймер b2b-orders-monitor): сайт, падения службы, ошибки, перебор паролей, диск
#   b2b-monitor daily    в 09:00 по Ташкенту (таймер b2b-orders-daily): сводка за сутки
#   b2b-monitor maintenance 30   не тревожить 30 минут (b2b-update ставит сам на время сборки)
set -uo pipefail
STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/b2b-orders-monitor}"
APP_DIR=/opt/b2b-orders
UNIT=b2b-orders
DB_NAME="${DB_NAME:-b2b}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/b2b-orders}"
APP_URL="${APP_URL:-http://127.0.0.1:3000/login}"
NOTIFY="${NOTIFY:-/usr/local/sbin/b2b-notify}"
LOGIN_FAIL_TOTAL="${LOGIN_FAIL_TOTAL:-30}"  # неудачных входов за 15 минут — тревога
LOGIN_FAIL_ONE="${LOGIN_FAIL_ONE:-15}"      # …или с одного адреса / на один номер
DISK_ALERT_PCT="${DISK_ALERT_PCT:-90}"
# Строки журнала, которые считаются ошибками приложения (стек «    at …» не считаем)
ERR_RE='⨯|(^|[^A-Za-z])(Error|TypeError|RangeError|ReferenceError|SyntaxError|PrismaClient[A-Za-z]*Error)(:| \[)|Unhandled|uncaught|FATAL|heap out of memory|ECONNREFUSED|EADDRINUSE|\[error\]'

install -d -m 700 "$STATE_DIR"
NOW="$(date +%s)"
get() { cat "$STATE_DIR/$1" 2>/dev/null || true; }
put() { printf '%s\n' "$2" > "$STATE_DIR/$1"; }
notify() { "$NOTIFY" "$@" || true; }
sql() { runuser -u postgres -- psql -d "$DB_NAME" -XqtA -F '|' -c "$1" 2>/dev/null; }
log_tail() { journalctl -u "$UNIT" -n 40 -o cat --no-pager 2>/dev/null | grep -v '^    at ' | tail -n "${1:-12}" | cut -c1-300; }
in_maintenance() { [ "$NOW" -lt "$(get maintenance || echo 0)" ] 2>/dev/null; }
human() { numfmt --to=iec --suffix=Б --format='%.1f' "${1:-0}" 2>/dev/null | sed 's/\./,/; s/KБ/ КБ/; s/MБ/ МБ/; s/GБ/ ГБ/' || echo "$1 Б"; }
money() { LC_ALL=C printf '%.0f' "${1:-0}" | sed ':a;s/\B[0-9]\{3\}\>/ &/;ta'; }
ago() { # секунды → «3 ч 5 мин»
  local s=$1 d h m; d=$((s / 86400)); h=$((s % 86400 / 3600)); m=$((s % 3600 / 60))
  if [ "$d" -gt 0 ]; then echo "$d д $h ч"; elif [ "$h" -gt 0 ]; then echo "$h ч $m мин"; else echo "$m мин"; fi
}

site_ok() { curl -fsS -o /dev/null --max-time 15 "$APP_URL" 2>/dev/null; }

check() {
  # 1. Перезагрузка сервера
  local boot; boot="$(cat /proc/sys/kernel/random/boot_id)"
  if [ -n "$(get boot_id)" ] && [ "$(get boot_id)" != "$boot" ]; then
    notify "🔄 Сервер перезагрузился (работает $(ago "$(cut -d. -f1 /proc/uptime)")). Сайт: $(site_ok && echo 'отвечает ✓' || echo 'пока не отвечает')"
  fi
  put boot_id "$boot"

  # 2. Перезапуски службы: сама упала (NRestarts растёт) или перезапустили вручную/обновлением
  local inv nres; inv="$(systemctl show -p InvocationID --value "$UNIT")"; nres="$(systemctl show -p NRestarts --value "$UNIT")"
  if [ -n "$(get invocation)" ] && [ -n "$inv" ] && [ "$inv" != "$(get invocation)" ]; then
    if [ "${nres:-0}" -gt "$(get nrestarts || echo 0)" ] 2>/dev/null; then
      notify --key crash --every 600 "💥 Приложение упало и перезапущено автоматически (автоперезапусков подряд: ${nres}).
Последние строки журнала:
$(journalctl -u "$UNIT" --since "-10min" -o cat --no-pager 2>/dev/null | grep -v '^    at ' | tail -n 15 | cut -c1-300)"
    elif ! in_maintenance; then
      notify --quiet "↻ Приложение перезапущено вручную ($(systemctl show -p ActiveEnterTimestamp --value "$UNIT"))."
    fi
  fi
  [ -z "$inv" ] || put invocation "$inv"
  put nrestarts "${nres:-0}"

  # 3. Сайт отвечает? Повтор через 20 с, чтобы не тревожить из-за одной медленной страницы
  if site_ok || { sleep 20; site_ok; }; then
    if [ -n "$(get down_since)" ]; then
      notify "🟢 Сайт снова работает. Был недоступен $(ago $((NOW - $(get down_since))))."
      rm -f "$STATE_DIR/down_since"
    fi
  elif ! in_maintenance; then
    if [ -z "$(get down_since)" ]; then
      put down_since "$NOW"; put rl_down "$NOW" # повтор — через час
      notify "🔴 Сайт не отвечает.
Служба: $(systemctl is-active "$UNIT"), база: $(systemctl is-active postgresql), nginx: $(systemctl is-active nginx)
Журнал:
$(log_tail 12)
Проверить: sudo systemctl status b2b-orders"
    else
      notify --key down --every 3600 "🔴 Сайт всё ещё не отвечает — уже $(ago $((NOW - $(get down_since))))."
    fi
  fi

  # 4. База и nginx (сайт может отвечать из кэша, а база — лежать)
  local svc; for svc in postgresql nginx; do
    systemctl is-active --quiet "$svc" || notify --key "svc_$svc" --every 1800 "🔴 Служба $svc не работает: sudo systemctl status $svc"
  done

  # 5. Ошибки в журнале приложения с прошлой проверки. Копятся и уходят одним сообщением не чаще раза в 15 минут
  local cur out new; cur="$(get journal_cursor)"
  if [ -n "$cur" ]; then
    out="$(journalctl -u "$UNIT" -o cat --no-pager --show-cursor --after-cursor="$cur" 2>/dev/null)"
  else
    out="$(journalctl -u "$UNIT" -o cat --no-pager --show-cursor --since=-5min 2>/dev/null)"
  fi
  new="$(printf '%s\n' "$out" | sed -n 's/^-- cursor: //p' | tail -n1)"
  [ -z "$new" ] || put journal_cursor "$new"
  printf '%s\n' "$out" | grep -v '^-- cursor: ' | grep -v '^    at ' | grep -E "$ERR_RE" | cut -c1-300 >> "$STATE_DIR/errors.pending"
  if [ -s "$STATE_DIR/errors.pending" ]; then
    local n; n="$(wc -l < "$STATE_DIR/errors.pending")"
    if "$NOTIFY" --key errors --every 900 "⚠️ Ошибки приложения: $n
$(sed -E 's/[0-9a-f]{8,}|[0-9]{3,}/#/g' "$STATE_DIR/errors.pending" | sort | uniq -c | sort -rn | head -n 6 | sed -E 's/^ *([0-9]+) /×\1  /')
Подробно: sudo journalctl -u b2b-orders --since -1h | grep -B2 -A8 Error"; then
      : > "$STATE_DIR/errors.pending"
    fi
    # Если отправить не вышло, а ошибок слишком много — оставляем последние 500
    tail -n 500 "$STATE_DIR/errors.pending" > "$STATE_DIR/errors.tmp" && mv "$STATE_DIR/errors.tmp" "$STATE_DIR/errors.pending"
  fi

  # 6. Перебор паролей: много неудачных входов за 15 минут
  local stats total; stats="$(sql "SELECT count(*), coalesce(max(c_ip),0), coalesce(max(c_ph),0) FROM (
      SELECT count(*) OVER (PARTITION BY ip) c_ip, count(*) OVER (PARTITION BY phone) c_ph
      FROM \"LoginAttempt\" WHERE NOT success AND \"createdAt\" > now() - interval '15 minutes') t")"
  total="${stats%%|*}"
  if [ -n "$stats" ] && { [ "${total:-0}" -ge "$LOGIN_FAIL_TOTAL" ] || [ "$(cut -d'|' -f2 <<<"$stats")" -ge "$LOGIN_FAIL_ONE" ] || [ "$(cut -d'|' -f3 <<<"$stats")" -ge "$LOGIN_FAIL_ONE" ]; }; then
    notify --key logins --every 3600 "🔐 Подозрение на подбор паролей: $total неудачных входов за 15 минут.
Чаще всего:
$(sql "SELECT coalesce(ip,'?') || ' — ' || count(*) || ' попыток, номеров: ' || count(DISTINCT phone) FROM \"LoginAttempt\"
      WHERE NOT success AND \"createdAt\" > now() - interval '15 minutes' GROUP BY ip ORDER BY count(*) DESC LIMIT 3")
$(sql "SELECT phone || ' — ' || count(*) FROM \"LoginAttempt\" WHERE NOT success AND \"createdAt\" > now() - interval '15 minutes'
      GROUP BY phone ORDER BY count(*) DESC LIMIT 3")
Вход по номеру после нескольких ошибок платформа уже ограничивает сама. Заблокировать адрес: sudo ufw deny from АДРЕС"
  fi

  # 7. Диск
  local pct; pct="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
  if [ "${pct:-0}" -ge "$DISK_ALERT_PCT" ]; then
    notify --key disk --every 21600 "💾 Диск занят на ${pct}% (свободно $(df -h --output=avail / | tail -1 | tr -d ' ')).
Больше всего места: $(du -sh "$BACKUP_DIR" /var/lib/b2b-orders/uploads /var/log 2>/dev/null | tr '\t' ' ' | paste -sd ',' | sed 's/,/, /g')"
  fi

  # 8. Копия не делалась больше 26 часов
  local lb; lb="$(get backup_at)"
  if [ -n "$lb" ] && [ $((NOW - lb)) -gt 93600 ]; then
    notify --key backup_old --every 43200 "🗄 Резервной копии не было $(ago $((NOW - lb))). Проверить: sudo systemctl status b2b-orders-backup.timer; сделать сейчас: sudo b2b-backup"
  fi
}

daily() {
  local since="now() - interval '24 hours'" o s l lines=()
  # Работа сайта
  local restarts errs active
  restarts="$(journalctl -u "$UNIT" --since -24h -o cat --no-pager 2>/dev/null | grep -c 'Scheduled restart job')"
  errs="$(journalctl -u "$UNIT" --since -24h -o cat --no-pager 2>/dev/null | grep -v '^    at ' | grep -cE "$ERR_RE")"
  active="$(systemctl show -p ActiveEnterTimestamp --value "$UNIT")"
  active="$(TZ=Asia/Tashkent date -d "$active" '+%d.%m %H:%M' 2>/dev/null || echo "$active")"
  if site_ok; then lines+=("🟢 Сайт работает (без перерыва с ${active:-?})"); else lines+=("🔴 Сайт сейчас не отвечает"); fi
  lines+=("Падений приложения: $restarts, ошибок в журнале: $errs")

  # Заказы и пользователи
  o="$(sql "SELECT count(*) FILTER (WHERE \"placedAt\" > $since), coalesce(sum(total) FILTER (WHERE \"placedAt\" > $since),0),
            count(*) FILTER (WHERE \"deliveredAt\" > $since), count(*) FILTER (WHERE \"cancelledAt\" > $since) FROM \"Order\"")"
  if [ -n "$o" ]; then
    IFS='|' read -r placed sum delivered cancelled <<<"$o"
    lines+=("📦 Заказы: оформлено $placed на $(money "$sum") сум, доставлено $delivered, отменено $cancelled")
    s="$(sql "SELECT (SELECT count(*) FROM \"Shop\" WHERE \"createdAt\" > $since), (SELECT count(*) FROM \"Supplier\" WHERE \"createdAt\" > $since),
              (SELECT count(*) FROM \"Supplier\" WHERE status IN ('PENDING','NEEDS_INFO'))")"
    IFS='|' read -r shops sups pending <<<"$s"
    lines+=("🏪 Новые: магазинов $shops, поставщиков $sups$([ "${pending:-0}" -gt 0 ] && echo " · ждут проверки: $pending")")
    l="$(sql "SELECT count(*) FILTER (WHERE success), count(*) FILTER (WHERE NOT success) FROM \"LoginAttempt\" WHERE \"createdAt\" > $since")"
    lines+=("🔐 Входы: удачных ${l%%|*}, неудачных ${l##*|}")
  else
    lines+=("🔴 База не ответила на запрос (sudo systemctl status postgresql)")
  fi

  # Резервная копия
  local lb; lb="$(get backup_at)"
  if [ -z "$lb" ]; then lines+=("🗄 Резервных копий ещё не было")
  elif [ $((NOW - lb)) -gt 93600 ]; then lines+=("❌ Последняя резервная копия $(ago $((NOW - lb))) назад")
  else lines+=("🗄 Копия $(date -d "@$lb" '+%d.%m %H:%M'): $(get backup_info)"); fi

  # Сервер
  local mem; mem="$(free | awk '/^Mem:/ {printf "%d", ($2-$7)*100/$2}')"
  lines+=("💾 Диск занят на $(df --output=pcent / | tail -1 | tr -d ' ') (свободно $(df -h --output=avail / | tail -1 | tr -d ' ')), память ${mem}%")
  local dom cert days; dom="$(grep -oP '^APP_DOMAIN="?\K[^"]+' "$APP_DIR/.env" 2>/dev/null || true)"
  cert="/etc/letsencrypt/live/$dom/cert.pem"
  if [ -n "$dom" ] && [ -r "$cert" ]; then
    days=$(( ($(date -d "$(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2)" +%s) - NOW) / 86400 ))
    if [ "$days" -lt 14 ]; then lines+=("⚠️ Сертификат HTTPS истекает через $days дн.: sudo certbot renew"); else lines+=("🔒 Сертификат HTTPS: ещё $days дн."); fi
  fi
  local upd; upd="$(get update_info)"; [ -z "$upd" ] || lines+=("⬆️ Последнее обновление: $upd")

  notify --quiet "📊 Сводка за сутки · $(TZ=Asia/Tashkent date '+%d.%m.%Y')
$(printf '%s\n' "${lines[@]}")"
}

case "${1:-check}" in
  check) check ;;
  daily) daily ;;
  maintenance) put maintenance $((NOW + ${2:-30} * 60)) ;;
  *) echo "Использование: b2b-monitor check|daily|maintenance [минут]" >&2; exit 2 ;;
esac
