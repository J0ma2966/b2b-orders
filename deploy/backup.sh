#!/usr/bin/env bash
# Резервная копия: база (pg_dump) и загруженные фото/логотипы. Хранятся KEEP_DAYS дней (по умолчанию 14).
#   sudo b2b-backup
# Восстановление — docs/deploy.md, раздел «Резервные копии». Копии лежат на том же сервере:
# раз в неделю скачивайте свежую к себе (scp), чтобы не потерять всё вместе с сервером.
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/var/backups/b2b-orders}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/b2b-orders/uploads}"
DB_NAME="${DB_NAME:-b2b}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"

install -d -m 700 "$BACKUP_DIR"
sudo -u postgres pg_dump --format=custom "$DB_NAME" > "$BACKUP_DIR/db_$STAMP.dump"
tar -czf "$BACKUP_DIR/uploads_$STAMP.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
chmod 600 "$BACKUP_DIR"/*_"$STAMP".*
find "$BACKUP_DIR" -type f \( -name 'db_*.dump' -o -name 'uploads_*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "Копия $STAMP: $(du -h "$BACKUP_DIR/db_$STAMP.dump" | cut -f1) база, $(du -h "$BACKUP_DIR/uploads_$STAMP.tar.gz" | cut -f1) файлы"
