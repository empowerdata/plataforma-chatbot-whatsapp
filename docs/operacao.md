# Operação — servidor Evolution + painel

## Subir do zero (VPS Ubuntu, 4 GB+ de RAM)

1. Crie o VPS (Hetzner CPX21/CPX31, Contabo, Hostinger KVM 2/4). Anote o IP.
2. DNS: crie `painel.seudominio.com` e `evo.seudominio.com` apontando para o IP (registro A).
3. No VPS:
   ```bash
   ssh root@IP
   apt-get install -y git
   git clone <URL-DO-REPO> /opt/chatbot
   cd /opt/chatbot
   bash infra/provision.sh        # instala Docker, cria os .env de exemplo
   nano infra/.env                # domínios, POSTGRES_PASSWORD, EVOLUTION_API_KEY
   nano infra/app.env             # APP_SECRET, INTERNAL_TOKEN, admin inicial
   bash infra/provision.sh        # agora sobe tudo
   ```
4. Abra `https://painel.seudominio.com`, entre com o admin inicial.
5. **Admin → Servidores → Adicionar**: nome, `https://evo.seudominio.com`, a `EVOLUTION_API_KEY`, capacidade (comece com 30). "Testar" precisa ficar verde.
6. Crie a primeira conta em **Admin → Contas** e envie o link de senha para o aluno.

## Rotina

| Quando | O quê |
|---|---|
| Diário (automático) | Backup do Postgres em `/var/backups/chatbot` (14 dias). Copie para fora do VPS (rclone → Google Drive/S3). |
| Semanal | `docker compose -f infra/docker-compose.yml --env-file infra/.env ps` e olhar **Admin → Eventos** (erros). |
| Capacidade > 80% | Subir outro VPS só com Evolution (mesmo compose sem `app`/`caddy` do painel, ou o compose inteiro num domínio novo) e cadastrar em Admin → Servidores. Números novos vão para o servidor com mais vaga. |
| WhatsApp quebrou (todos os números caindo/QR não conecta) | Atualizar a Evolution: `docker compose ... pull evolution && docker compose ... up -d evolution`. Antes, olhe as notas da versão em github.com/EvolutionAPI/evolution-api/releases. |
| Atualizar o painel | `git pull && docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build app` (migrations rodam sozinhas). |

## Dimensionamento (validar na Fase 0)

- Cada instância Baileys consome ~80–150 MB de RAM ociosa; picos ao sincronizar.
- Referência inicial: VPS de 8 GB ≈ 30–40 números. Meça com `docker stats` e ajuste a capacidade cadastrada.

## Coisas que NÃO fazer

- Nunca trocar `APP_SECRET` depois de ter contas: os segredos salvos ficam ilegíveis.
- Nunca ligar `DATABASE_SAVE_DATA_NEW_MESSAGE` na Evolution: quebra a promessa de que não guardamos conversas.
- Não expor a porta 8080 da Evolution direto; só via Caddy (HTTPS).

## Restaurar backup

```bash
gunzip -c /var/backups/chatbot/pg-AAAAMMDD-HHMM.sql.gz | docker exec -i chatbot-postgres-1 psql -U postgres
docker compose -f infra/docker-compose.yml --env-file infra/.env restart evolution app
```

## Monitor externo (opcional)

Além do monitor interno, um cron fora do VPS pode chamar `GET https://painel.../api/internal/monitor` com header `x-internal-token: <INTERNAL_TOKEN>` e alertar se não responder 200.
