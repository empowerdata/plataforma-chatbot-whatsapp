#!/usr/bin/env bash
# Backup diário do Postgres (sessões da Evolution + banco do painel).
# Guarda 14 dias em /var/backups/chatbot. Restaurar: gunzip -c arquivo.sql.gz | docker exec -i chatbot-postgres-1 psql -U postgres
set -euo pipefail
DIR=/var/backups/chatbot
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M)
docker exec chatbot-postgres-1 pg_dumpall -U postgres | gzip > "$DIR/pg-$STAMP.sql.gz"
find "$DIR" -name "pg-*.sql.gz" -mtime +14 -delete
echo "backup ok: $DIR/pg-$STAMP.sql.gz"
