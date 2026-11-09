#!/usr/bin/env bash
# Смена телефона (логина) супер-администратора:
#   sudo b2b-set-admin-phone 90 123 45 67      (можно и +998901234567)
# Пароль, история и все данные остаются прежними, входить дальше по новому номеру.
# Меняется супер-админ с номером из SUPERADMIN_PHONE в .env (или единственный супер-админ),
# новый номер записывается и в .env, чтобы повторная установка не создала второго.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/b2b-orders}"
DB_NAME="${DB_NAME:-b2b}"
ENV_FILE="$APP_DIR/.env"
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo: sudo b2b-set-admin-phone 90 123 45 67" >&2; exit 1; }

# Тот же разбор номера, что в приложении (src/lib/phone.ts): 9 цифр или 998 + 9 цифр
norm() {
  local d; d="$(printf '%s' "$1" | tr -cd '0-9')"
  if [ "${#d}" = 12 ] && [ "${d:0:3}" = 998 ]; then echo "+$d"
  elif [ "${#d}" = 9 ]; then echo "+998$d"; fi
}
pretty() { sed -E 's/^\+998([0-9]{2})([0-9]{3})([0-9]{2})([0-9]{2})$/+998 \1 \2-\3-\4/' <<<"$1"; }
NEW="$(norm "$*")"
[ -n "$NEW" ] || { echo "Укажите узбекский номер: sudo b2b-set-admin-phone 90 123 45 67" >&2; exit 1; }

# psql с переменными (подставляются как строки, без риска для запроса)
sql() { runuser -u postgres -- psql -d "$DB_NAME" -XqtA -F '|' -v ON_ERROR_STOP=1 "$@"; }

ENV_PHONE="$(grep -oP '^SUPERADMIN_PHONE="?\K[^"]*' "$ENV_FILE" 2>/dev/null || true)"
ADMIN="$(sql -v phone="$ENV_PHONE" <<'SQL'
SELECT id, phone FROM "User" WHERE "isSuperAdmin" AND "deletedAt" IS NULL AND phone = :'phone';
SQL
)"
if [ -z "$ADMIN" ]; then
  ADMIN="$(sql <<'SQL'
SELECT id, phone FROM "User" WHERE "isSuperAdmin" AND "deletedAt" IS NULL;
SQL
)"
  if [ "$(grep -c . <<<"$ADMIN")" != 1 ]; then
    echo "Не понял, какого супер-админа менять. Супер-админы в базе:" >&2
    cut -d'|' -f2 <<<"$ADMIN" >&2
    echo "Впишите нужный номер в SUPERADMIN_PHONE в $ENV_FILE и повторите." >&2
    exit 1
  fi
fi
ID="${ADMIN%%|*}"; OLD="${ADMIN##*|}"
[ "$OLD" != "$NEW" ] || { echo "У супер-админа уже номер $(pretty "$NEW")"; exit 0; }

BUSY="$(sql -v phone="$NEW" <<'SQL'
SELECT 1 FROM "User" WHERE phone = :'phone';
SQL
)"
[ -z "$BUSY" ] || { echo "Номер $(pretty "$NEW") уже занят другим пользователем платформы. Выберите другой." >&2; exit 1; }

sql -v id="$ID" -v old="$OLD" -v new="$NEW" <<'SQL'
BEGIN;
UPDATE "User" SET phone = :'new', "updatedAt" = now() WHERE id = :'id' AND "isSuperAdmin";
INSERT INTO "AuditLog" (id, "actorRole", entity, "entityId", action, changes, source, "createdAt")
VALUES (gen_random_uuid()::text, 'SYSTEM', 'User', :'id', 'phone.change',
        jsonb_build_array(jsonb_build_object('field', 'phone', 'old', :'old', 'new', :'new')), 'server', now());
COMMIT;
SQL

if grep -q '^SUPERADMIN_PHONE=' "$ENV_FILE"; then
  sed -i "s|^SUPERADMIN_PHONE=.*|SUPERADMIN_PHONE=\"$NEW\"|" "$ENV_FILE"
else
  echo "SUPERADMIN_PHONE=\"$NEW\"" >> "$ENV_FILE"
fi
echo "Готово: супер-админ теперь входит по номеру $(pretty "$NEW") (был $(pretty "$OLD")). Пароль прежний."
