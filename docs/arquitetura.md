# Arquitetura

Para o modelo de negócio e o porquê de cada decisão, ver `docs/visao-e-decisoes.md`.

## Em uma frase

Um painel (Next.js) que o próprio aluno instala no servidor dele: a Evolution API (WhatsApp) vem junto e fica privada, as conversas ficam no banco de dados do próprio servidor (ou, opcionalmente, num Supabase do aluno) e a IA usa a chave OpenAI do aluno.

## Peças

```
┌──────────────┐  webhook   ┌───────────────────────────────┐   SQL    ┌─────────────────────────┐
│ Evolution API│ ─────────▶ │ Painel + runtime (Next.js)     │ ───────▶ │ Banco das conversas     │
│ (mesmo       │ ◀───────── │  /api/webhooks/evolution/:tok  │          │ servidor do aluno       │
│  servidor,   │  sendText  │  engine (debounce, RAG, tools) │          │ (ou Supabase dele)      │
│  privada)    │            │  caixa de entrada · monitor    │          │ contatos, msgs, vetores │
└──────────────┘            └───────────────┬───────────────┘          └─────────────────────────┘
                                            │ Drizzle                 ┌──────────────────┐
                                            ▼                         │ OpenAI do aluno  │
                                   ┌──────────────────┐   AI SDK      │ chat, embeddings,│
                                   │ Postgres do      │ ────────────▶ │ transcrição,     │
                                   │ painel (plano de │               │ visão            │
                                   │ controle)        │               └──────────────────┘
                                   └──────────────────┘
```

### Plano de controle (Postgres do painel, `src/server/db/schema.ts`)

`accounts`, `users` (papéis `super_admin`, `member`, `client`), `sessions`, `password_tokens`, `integrations` (segredos criptografados), `evolution_nodes`, `clients`, `numbers`, `bots`, `knowledge_items` (metadados), `events`.

- Em dev: PGlite (Postgres em WASM) em `./.data/control`. Em produção: `DATABASE_URL`.
- Migrations: `drizzle/` (geradas por `npx drizzle-kit generate`), aplicadas automaticamente na subida.

### Plano de dados (banco das conversas, `src/server/tenant/`)

Schema `chatbot`: `contacts` (com `bot_disabled` e `notes`), `conversations` (com `category` e `resolved_at`), `messages`, `kb_chunks` (pgvector 1536), `daily_stats`, `meta` (versão do schema).

Onde fica, nesta ordem (`resolveTarget` em `registry.ts`):

1. **Supabase do aluno**, se ele conectou um em Integrações (opcional, "avançado").
2. **Postgres do próprio servidor** (`DATA_DATABASE_URL`) — o padrão de toda instalação. No VPS é o serviço `dados` do `infra/docker-compose.yml` (imagem `pgvector/pgvector:pg16`, separado do Postgres da Evolution de propósito); no Render é o mesmo banco do painel (schema `chatbot` separado).
3. **PGlite por conta** em `./.data/tenants/<accountId>` (só em dev), com o **mesmo SQL** — o que passa nos testes passa em produção.

Toda abertura roda `installSchema` (idempotente): uma atualização do painel nunca deixa o banco de conversas numa versão antiga. `TenantStore` é a única porta de entrada para esse banco.

### Evolution API (`src/server/evolution/`)

- `EvolutionClient` é a interface; `HttpEvolutionClient` fala com o servidor real (v2) e `FakeEvolutionClient` simula tudo em dev (QR, webhooks, envio). A simulada entrega os webhooks direto no motor, no mesmo processo — funciona em qualquer porta.
- Numa instalação própria, o servidor Evolution que vem junto é cadastrado sozinho no primeiro boot (`EVOLUTION_BUNDLED_*`).
- Cada número = uma instância `<slug>-<aleatório>` com webhook `APP_URL/api/webhooks/evolution/<token>`.
- A Evolution é configurada para **não persistir mensagens**, só a sessão (ver `infra/evolution.env.example`).

### Engine (`src/server/engine/`)

Fluxo de `messages.upsert`:

1. `inbound.ts` valida, deduplica por `external_id`, ignora grupos.
2. `fromMe` com id desconhecido = **alguém respondeu pelo celular** → salva como `human`, pausa o bot para o contato por N horas, conversa vira `human`. Ids que o próprio painel enviou (bot ou resposta pela caixa de entrada) ficam em `sent-cache.ts` e são ignorados.
3. Mensagem do cliente → `upsertContact`, `getOrCreateConversation` (nova conversa após 12 h de silêncio), transcreve áudio e guarda a imagem num cache curto (`media-cache.ts`, para a visão) se houver IA, salva, contabiliza.
4. O bot responde só se: número com bot ligado, bot ativo, contato não bloqueado, **não desligado à mão** (`bot_disabled`) e **sem pausa vigente** (`bot_paused_until`). Aí `scheduler.schedule(numero:contato, debounce)`; várias mensagens seguidas viram uma rodada só.
5. `respondToContact`: pega o lote pendente, faz RAG (`embed` + `<=>` no pgvector; sem chave OpenAI cai para busca textual), monta o prompt (`context.ts`), roda `runLlmTurn` (AI SDK com tools `chamar_atendente`, `enviar_cardapio`, `enviar_localizacao`, `categorizar_conversa`; sem chave usa o backend simulado), divide em bolhas (`reply.ts`), envia com "digitando", salva mensagens e estatísticas.
6. Fora do horário: manda a mensagem de fora de horário uma vez por conversa e continua respondendo.

`chamar_atendente` só deve ser usada quando o cliente pede uma pessoa, ao concluir um pedido/agendamento que a equipe confirma, ou se o cliente segue insatisfeito — nunca só por o bot não saber uma resposta (ver `context.ts`). Ao chamar, a conversa fica "precisa de você" e o bot pausa pelo tempo configurado.

Runtime hoje é **em processo** (memória). Para várias réplicas, trocar `MemoryScheduler` por BullMQ/Redis mantendo a interface `Scheduler`.

### Caixa de entrada (`src/server/services/inbox.ts` + `src/components/inbox/`)

A mesma tela para a equipe do aluno (`/conversas`) e para o cliente final (`/portal/conversas`): lista com busca, abas (abertas, aguardando, finalizadas, todas) e filtros por cliente/número/categoria, conversa com resposta pelo painel, e ficha do contato com notas internas. Atualiza sozinha a cada 5 s. A lista vem em páginas de 60 (`INBOX_PAGE`, "carregar mais" até `INBOX_MAX` = 600), com os filtros na URL (`?v=&cl=&n=&cat=&q=&lim=&c=`).

- A **situação** de cada conversa é uma só, derivada em `statusOf`: finalizada > aguardando (o bot chamou a equipe, `needs_human`) > bot atendendo (bot ativo) > com a equipe (bot pausado/desligado). A lista, o cabeçalho da conversa e a ficha mostram sempre a mesma.

- O **escopo** (`InboxScope`) decide o que cada um alcança: a equipe vê todos os números da conta; o cliente final só os números do `client_id` dele. Toda leitura e toda ação passam por `scopeNumbers`, então um cliente não toca conversa de outro nem adivinhando um id.
- O **estado do bot** em cada conversa é calculado em um lugar só (`computeBotState`): ativo, pausado (com o motivo e a hora de voltar), desligado à mão, contato bloqueado, bot desligado no número, sem bot. A tela explica o porquê e oferece a ação certa ("Reativar agora", "Ligar o bot"…).
- **Responder pelo painel** envia pela Evolution, marca o id em `sent-cache` (o eco não vira "pelo celular") e pausa o bot pelo mesmo tempo de uma resposta pelo celular. O interruptor liga na hora.

### Indicadores (`src/server/services/indicators.ts` + `src/components/indicators/`)

Mesma tela para a equipe (`/indicadores`, filtro por cliente) e para o cliente final (`/portal`), com o mesmo escopo por números da caixa de entrada. Cada número sai de um lugar:

- **Série por dia, conversas iniciadas, pedidos de atendente**: `chatbot.daily_stats`, que a limpeza não apaga — vale para 7, 30 ou 90 dias. O "dia" é o de Brasília (`dayKey`), não o de UTC.
- **Em aberto / aguardando**: retrato de agora, direto de `conversations`.
- **Finalizadas, % só pelo bot, assuntos, horário**: das conversas e mensagens guardadas. Como elas somem depois de `CONVERSATION_RETENTION_DAYS`, a tela avisa quando o período pedido passa desse limite.

Gráficos em SVG próprio (`charts.tsx`, sem biblioteca): série única em `--color-chart-1`, "sem categoria"/"outras" em `--color-chart-muted`, dica ao passar o mouse e botão para ver a mesma informação em tabela.

### Monitor (`src/server/monitor.ts`)

A cada 60 s (iniciado por `instrumentation.ts`) confere a saúde dos servidores e o estado de cada instância, corrige o status no banco e registra eventos. Também exposto em `GET /api/internal/monitor` para cron externo.

O mesmo processo, no máximo uma vez por dia, apaga conversas e mensagens sem atividade há mais de `CONVERSATION_RETENTION_DAYS` (padrão 30) no banco de conversas de cada conta — mensagens caem em cascata junto com a conversa. As estatísticas agregadas (`chatbot.daily_stats`) não são apagadas.

### Segurança

- Segredos dos alunos: AES-256-GCM com chave derivada de `APP_SECRET` (`crypto.ts`). Nunca vão ao navegador.
- Sessões próprias (cookie httpOnly + tabela `sessions`), sem serviço externo de auth.
- Webhook autenticado por token aleatório na URL; rotas internas por `INTERNAL_TOKEN`.
- Todo serviço filtra por `accountId` (e, no portal, por `clientId`) vindo do guard, nunca do navegador. Login `client` é barrado em `requireAccount`/`getAccountOrThrow`.

### Horários

O servidor roda em UTC; toda data exibida passa pelos formatadores de `src/lib/utils.ts`, com o fuso `America/Sao_Paulo` explícito.

## Decisões (e por quê)

| Decisão | Motivo |
|---|---|
| Tudo na instalação do aluno (painel, Evolution, bancos) | A Daxus não opera infraestrutura de ninguém. Ver `docs/visao-e-decisoes.md`. |
| Conversas no banco do próprio servidor, Supabase opcional | Zero configuração para quem não é técnico, e as conversas continuam na infraestrutura do aluno. |
| Banco `dados` separado do Postgres da Evolution (VPS) | Precisa de pgvector; trocar a imagem do banco que já guarda a sessão do WhatsApp arriscaria instalações existentes. |
| String de conexão (quando usa Supabase) em vez de URL + service_role | Um único caminho SQL para dev (PGlite) e produção, e instalação/atualização de tabelas automática. |
| Painel e runtime no mesmo processo | Simplicidade operacional (um container). A engine não importa nada do Next e pode virar serviço separado depois. |
| Auth própria | Roda em qualquer Postgres, sem serviço externo. |
| AI SDK (Vercel) | Trocar/adicionar provedor (Anthropic, Google) vira configuração. |
