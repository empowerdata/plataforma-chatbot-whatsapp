#!/usr/bin/env bash
# Backup diário dos dois bancos: "postgres" (sessões da Evolution + painel) e
# "dados" (conversas, contatos, base de conhecimento). Guarda 14 dias em
# /var/backups/chatbot. Restaurar:
#   gunzip -c pg-XXXX.sql.gz    | docker exec -i chatbot-postgres-1 psql -U postgres
#   gunzip -c dados-XXXX.sql.gz | docker exec -i chatbot-dados-1 psql -U postgres
set -euo pipefail
DIR=/var/backups/chatbot
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M)
docker exec chatbot-postgres-1 pg_dumpall -U postgres | gzip > "$DIR/pg-$STAMP.sql.gz"
if docker ps --format '{{.Names}}' | grep -qx chatbot-dados-1; then
  docker exec chatbot-dados-1 pg_dumpall -U postgres | gzip > "$DIR/dados-$STAMP.sql.gz"
fi
find "$DIR" \( -name "pg-*.sql.gz" -o -name "dados-*.sql.gz" \) -mtime +14 -delete
echo "backup ok: $DIR (pg-$STAMP, dados-$STAMP)"
