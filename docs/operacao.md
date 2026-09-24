# Operação — referência técnica do VPS

Guia técnico para quem vai mexer por baixo do capô. Para o passo a passo
simples que vai para o aluno, ver `docs/instalar-vps.md`.

Desde a decisão de "instalação de conta única" (cada aluno com o próprio
servidor), este VPS pertence e é operado por quem instalou — não existe mais
um "Admin → Contas" da Daxus provisionando alunos aqui. O primeiro acesso já
cria a conta do próprio dono da instalação sozinho (ver `bootstrapCore` em
`src/server/db/bootstrap.ts`).

## Subir do zero

```bash
ssh root@SEU-IP
curl -fsSL https://raw.githubusercontent.com/empowerdata/plataforma-chatbot-whatsapp/main/infra/provision.sh | bash
```

O script (`infra/provision.sh`) faz tudo sozinho: instala Docker, pergunta
nome do negócio / e-mail / senha, gera todas as senhas e chaves internas,
gera um domínio com HTTPS automático via [sslip.io](https://sslip.io) quando
não há domínio próprio, sobe os serviços e agenda o backup diário. Rodar de
novo detecta a instalação existente e oferece só reiniciar/atualizar.

Só depois disso é que existe algo para configurar dentro do painel (OpenAI,
primeiro número) — isso já é guiado pela própria interface. O banco das
conversas já sobe pronto junto (serviço `dados`); Supabase é opcional.

## Arquitetura no VPS

- `caddy`: único serviço exposto à internet (portas 80/443), HTTPS automático.
- `app`: o painel (Next.js), só acessível via Caddy.
- `evolution`: API do WhatsApp, **sem porta publicada** (`expose`, não
  `ports`) — só o `app` fala com ela pela rede interna do Docker. Cadastrada
  sozinha no banco do painel via `EVOLUTION_BUNDLED_HOST/PORT/API_KEY`
  (mesmas variáveis usadas na instalação via Render).
- `postgres`: duas bases lógicas (`chatbot` para o painel, `evolution` para
  a sessão do WhatsApp) — criadas por `infra/init-db.sql`.
- `dados`: o banco das conversas (contatos, mensagens, base de conhecimento
  vetorizada), imagem `pgvector/pgvector:pg16`. Separado do `postgres` de
  propósito: precisa da extensão pgvector, e trocar a imagem do banco que já
  guarda a sessão do WhatsApp arriscaria instalações existentes. Tabelas
  instaladas/atualizadas sozinhas pelo painel (`DATA_DATABASE_URL`).
- `redis`: cache do Evolution.

## Rotina

| Quando | O quê |
|---|---|
| Diário (automático) | Backup dos dois bancos (`postgres` e `dados`) em `/var/backups/chatbot` (14 dias). Copie para fora do VPS (rclone → Google Drive/S3) — hoje o backup fica no mesmo disco do servidor. |
| Semanal | `docker compose -f infra/docker-compose.yml --env-file infra/.env ps` e olhar **Admin → Eventos** dentro do painel (erros). |
| WhatsApp quebrou (números caindo, QR não conecta) | Atualizar a Evolution: `docker compose -f infra/docker-compose.yml pull evolution && docker compose -f infra/docker-compose.yml --env-file infra/.env up -d evolution`. Antes, olhe as notas da versão em github.com/EvolutionAPI/evolution-api/releases. |
| Atualizar o painel | `cd /opt/chatbot && git pull && docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build` (migrations rodam sozinhas; serviços novos, como o `dados`, sobem sozinhos). |
| Quer mais de um servidor Evolution (crescer capacidade) | Subir outro VPS só com Evolution e cadastrar em Admin → Servidores — o restante da arquitetura (`evolution_nodes`, `pickNode()`) já foi pensado para múltiplos servidores por conta, mesmo numa instalação de conta única. |

## Dimensionamento

- Cada instância Baileys consome ~80–150 MB de RAM ociosa; picos ao
  sincronizar. Um VPS de 2 a 4 GB já atende uma instalação de conta única com
  vários números.
- Meça com `docker stats` se pensar em crescer além de uma dúzia de números
  no mesmo servidor.

## Coisas que NÃO fazer

- Nunca trocar `APP_SECRET` (em `infra/app.env`) depois de ter dados: os
  segredos salvos (string do Supabase, chave da OpenAI) ficam ilegíveis.
- Nunca ligar `DATABASE_SAVE_DATA_NEW_MESSAGE` na Evolution: quebra a
  promessa de que não guardamos conversas.
- Não publicar a porta 8080 da Evolution (`ports:` em vez de `expose:`) — ela
  deve continuar só acessível pela rede interna do Docker.

## Restaurar backup

```bash
gunzip -c /var/backups/chatbot/pg-AAAAMMDD-HHMM.sql.gz | docker exec -i chatbot-postgres-1 psql -U postgres
docker compose -f infra/docker-compose.yml --env-file infra/.env restart evolution app
```

## Monitor externo (opcional)

Além do monitor interno, um cron fora do VPS pode chamar
`GET https://SEU-DOMINIO/api/internal/monitor` com header
`x-internal-token: <INTERNAL_TOKEN>` (de `infra/app.env`) e alertar se não
responder 200.
