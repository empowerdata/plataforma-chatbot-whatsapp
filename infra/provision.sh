#!/usr/bin/env bash
# =============================================================================
# Instala tudo num VPS Ubuntu do zero, com um comando só.
#
#   ssh root@SEU-IP
#   curl -fsSL https://raw.githubusercontent.com/empowerdata/plataforma-chatbot-whatsapp/main/infra/provision.sh | bash
#
# Faz perguntas simples (nome do negócio, e-mail, senha) e cuida do resto
# sozinho: instala o Docker, gera todas as senhas e chaves, sobe o painel,
# o WhatsApp e o banco de dados, e deixa tudo com HTTPS automático — sem
# precisar editar nenhum arquivo na mão. Ver docs/instalar-vps.md.
# =============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/chatbot}"
REPO_URL="${REPO_URL:-https://github.com/empowerdata/plataforma-chatbot-whatsapp.git}"
TTY=/dev/tty

# --------------------------------------------------------------- utilidades

info()  { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
die()   { printf '\033[1;31mErro:\033[0m %s\n' "$1" >&2; exit 1; }

# `read` normal não funciona quando o script roda via `curl | bash` (a entrada
# já está ocupada pelo próprio script). Lendo direto do terminal (/dev/tty)
# funciona nos dois casos: rodando local ou via pipe, desde que exista um
# terminal de verdade por trás (é o caso normal de uma sessão SSH).
ask() {
  local prompt="$1" default="${2:-}" answer=""
  if [ -r "$TTY" ]; then
    printf '%s ' "$prompt" > "$TTY"
    read -r answer < "$TTY" || true
  else
    read -r -p "$prompt " answer || true
  fi
  echo "${answer:-$default}"
}

ask_password() {
  local prompt="$1" answer=""
  if [ -r "$TTY" ]; then
    printf '%s ' "$prompt" > "$TTY"
    read -r -s answer < "$TTY" || true
    printf '\n' > "$TTY"
  else
    read -r -s -p "$prompt " answer || true
    echo
  fi
  echo "$answer"
}

random_hex() { openssl rand -hex "$1"; }

# ------------------------------------------------------------- pré-requisitos

[ "$(id -u)" = "0" ] || die "Rode como root (ex.: ssh root@seu-ip, depois cole o comando de novo)."

info "Atualizando o sistema (pode levar um minuto)"
apt-get update -y -qq
apt-get install -y -qq ca-certificates curl git ufw openssl >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  info "Instalando o Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi

info "Liberando só as portas necessárias (SSH, HTTP, HTTPS)"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

if [ ! -d "$REPO_DIR" ]; then
  info "Baixando o projeto"
  git clone --quiet "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR/infra"

# ---------------------------------------------------------------- perguntas

if [ -f .env ] && [ -f app.env ]; then
  info "Já existe uma instalação aqui (infra/.env encontrado)."
  REUSE=$(ask "Quer reaproveitar a configuração e só atualizar/reiniciar os serviços? (S/n)" "s")
  if [ "${REUSE,,}" != "n" ]; then
    SKIP_QUESTIONS=1
  fi
fi

if [ "${SKIP_QUESTIONS:-0}" != "1" ]; then
  echo
  echo "Só faltam algumas perguntas — o resto o instalador resolve sozinho."
  echo

  ACCOUNT_NAME=$(ask "Qual o nome do seu negócio ou agência?")
  [ -n "$ACCOUNT_NAME" ] || die "Informe um nome."

  ADMIN_EMAIL=$(ask "Qual e-mail você vai usar para entrar no painel?")
  [ -n "$ADMIN_EMAIL" ] || die "Informe um e-mail."

  ADMIN_PASSWORD=$(ask_password "Crie uma senha para o painel (não aparece na tela):")
  [ ${#ADMIN_PASSWORD} -ge 8 ] || die "A senha precisa ter pelo menos 8 caracteres."

  echo
  echo "Domínio: se você já tem um domínio próprio e apontou o DNS dele para"
  echo "o IP deste servidor, informe ele agora. Se não tiver, deixe em branco"
  echo "que o instalador gera um endereço gratuito que já funciona com HTTPS."
  CUSTOM_DOMAIN=$(ask "Domínio próprio (ou Enter para pular):" "")

  if [ -n "$CUSTOM_DOMAIN" ]; then
    APP_DOMAIN="$CUSTOM_DOMAIN"
  else
    info "Descobrindo o IP público deste servidor"
    PUBLIC_IP=$(curl -fsSL -4 https://ifconfig.me || curl -fsSL -4 https://icanhazip.com || true)
    [ -n "$PUBLIC_IP" ] || die "Não consegui descobrir o IP público. Informe um domínio próprio e rode de novo."
    APP_DOMAIN="$(echo "$PUBLIC_IP" | tr '.' '-').sslip.io"
    echo "Endereço gerado: https://$APP_DOMAIN"
  fi

  POSTGRES_PASSWORD=$(random_hex 24)
  EVOLUTION_API_KEY=$(random_hex 24)
  APP_SECRET=$(random_hex 32)
  INTERNAL_TOKEN=$(random_hex 16)

  cat > .env <<EOF
APP_DOMAIN=$APP_DOMAIN
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
EVOLUTION_API_KEY=$EVOLUTION_API_KEY
EOF

  cat > app.env <<EOF
APP_SECRET=$APP_SECRET
INTERNAL_TOKEN=$INTERNAL_TOKEN
BOOTSTRAP_ACCOUNT_NAME=$ACCOUNT_NAME
BOOTSTRAP_ADMIN_EMAIL=$ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

  [ -f evolution.env ] || cp evolution.env.example evolution.env

  chmod 600 .env app.env evolution.env
fi

# ---------------------------------------------------------------- subir tudo

info "Subindo os serviços (a primeira vez demora alguns minutos)"
cd "$REPO_DIR"
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build

info "Agendando backup diário do banco de dados (03:00)"
( crontab -l 2>/dev/null | grep -v backup.sh ; echo "0 3 * * * bash $REPO_DIR/infra/backup.sh >> /var/log/chatbot-backup.log 2>&1" ) | crontab -

APP_DOMAIN=$(grep '^APP_DOMAIN=' infra/.env | cut -d= -f2-)

info "Esperando o painel ficar pronto"
READY=0
for _ in $(seq 1 60); do
  if curl -fsSk -o /dev/null "https://$APP_DOMAIN/login" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 5
done

echo
if [ "$READY" = "1" ]; then
  echo "Tudo pronto! Seu painel: https://$APP_DOMAIN"
else
  warn "Os serviços subiram, mas o painel ainda não respondeu em https://$APP_DOMAIN."
  echo "   Isso pode ser só o certificado HTTPS terminando de sair (leva até uns"
  echo "   2 minutos na primeira vez). Espere um pouco e abra o endereço."
  echo "   Se continuar sem responder: docker compose -f infra/docker-compose.yml logs -f caddy app"
fi
echo "Entre com o e-mail e a senha que você acabou de criar."
echo
echo "Comandos úteis, sempre dentro de $REPO_DIR:"
echo "  Ver o que está rodando : docker compose -f infra/docker-compose.yml ps"
echo "  Ver os logs do painel  : docker compose -f infra/docker-compose.yml logs -f app"
echo "  Atualizar depois de uma novidade:"
echo "    git pull && docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build"
