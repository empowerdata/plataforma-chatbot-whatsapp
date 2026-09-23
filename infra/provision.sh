#!/usr/bin/env bash
# =============================================================================
# Prepara um VPS Ubuntu 22.04/24.04 do zero e sobe tudo (Evolution + painel).
#
#   ssh root@IP
#   curl -fsSL https://raw.githubusercontent.com/SEU-USUARIO/SEU-REPO/main/infra/provision.sh -o provision.sh
#   bash provision.sh
#
# Ou copie o repositório para /opt/chatbot e rode: bash infra/provision.sh
# =============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/chatbot}"
REPO_URL="${REPO_URL:-}"

echo "==> Atualizando o sistema"
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Instalando Docker"
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Firewall: só SSH, HTTP e HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

if [ ! -d "$REPO_DIR" ]; then
  if [ -z "$REPO_URL" ]; then
    echo "!! Defina REPO_URL=https://github.com/... ou copie o projeto para $REPO_DIR antes de rodar."
    exit 1
  fi
  echo "==> Clonando o projeto"
  git clone "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR/infra"

for f in .env app.env evolution.env; do
  if [ ! -f "$f" ]; then
    cp "$f.example" "$f"
    echo "==> Criado infra/$f a partir do exemplo. EDITE antes de continuar."
  fi
done

if grep -q "troque" .env app.env; then
  echo
  echo "!! Edite infra/.env e infra/app.env (domínios, senhas e chaves) e rode de novo:"
  echo "   cd $REPO_DIR && docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build"
  echo
  echo "   Dicas: openssl rand -hex 32   (APP_SECRET, EVOLUTION_API_KEY)"
  exit 0
fi

echo "==> Subindo os serviços"
cd "$REPO_DIR"
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build

echo "==> Agendando backup diário do Postgres (03:00)"
( crontab -l 2>/dev/null | grep -v backup.sh ; echo "0 3 * * * bash $REPO_DIR/infra/backup.sh >> /var/log/chatbot-backup.log 2>&1" ) | crontab -

echo
echo "Pronto. Painel: https://$(grep APP_DOMAIN infra/.env | cut -d= -f2)"
echo "Evolution:     https://$(grep EVO_DOMAIN infra/.env | cut -d= -f2)"
echo "Cadastre o servidor Evolution em Admin → Servidores com a EVOLUTION_API_KEY."
