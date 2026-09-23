# Arquitetura

## Em uma frase

Um painel (Next.js) onde alunos cadastram números de WhatsApp e bots; a Evolution API é **nossa** (hospedada), o banco de conversas e a chave de IA são **do aluno** (Supabase + OpenAI).

## Peças

```
┌──────────────┐  webhook   ┌───────────────────────────────┐   SQL    ┌──────────────────┐
│ Evolution API│ ─────────▶ │ Painel + runtime (Next.js)     │ ───────▶ │ Supabase do aluno│
│ (nossa, VPS) │ ◀───────── │  /api/webhooks/evolution/:tok  │          │ contatos, msgs,  │
│ 1 instância  │  sendText  │  engine (debounce, RAG, tools) │          │ embeddings, stats│
│ por número   │            │  monitor (a cada 60 s)         │          └──────────────────┘
└──────────────┘            └───────────────┬───────────────┘
                                            │ Drizzle                 ┌──────────────────┐
                                            ▼                         │ OpenAI do aluno  │
                                   ┌──────────────────┐   AI SDK      │ chat, embeddings,│
                                   │ Postgres nosso   │ ────────────▶ │ transcrição      │
                                   │ (plano de        │               └──────────────────┘
                                   │  controle)       │
                                   └──────────────────┘
```

### Plano de controle (nosso Postgres, `src/server/db/schema.ts`)

`accounts`, `users`, `sessions`, `password_tokens`, `integrations` (segredos criptografados), `evolution_nodes`, `clients`, `numbers`, `bots`, `knowledge_items` (metadados), `events`.

- Em dev: PGlite (Postgres em WASM) em `./.data/control`. Em produção: `DATABASE_URL`.
- Migrations: `drizzle/` (geradas por `npx drizzle-kit generate`), aplicadas automaticamente na subida.

### Plano de dados (Supabase do aluno, `src/server/tenant/`)

Schema `chatbot`: `contacts`, `conversations`, `messages`, `kb_chunks` (pgvector 1536), `daily_stats`, `meta` (versão do schema).

- O aluno cola a **string de conexão** (Session pooler). A plataforma testa, instala/atualiza as tabelas (`installSchema`) e guarda a string criptografada.
- Em dev sem Supabase: PGlite por conta em `./.data/tenants/<accountId>` com o **mesmo SQL**, então o que passa nos testes passa no Supabase.
- `TenantStore` é a única porta de entrada para esse banco.

### Evolution API (`src/server/evolution/`)

- `EvolutionClient` é a interface; `HttpEvolutionClient` fala com o servidor real (v2) e `FakeEvolutionClient` simula tudo em dev (QR, webhooks, envio).
- `evolution_nodes` lista os servidores; `pickNode()` escolhe o com mais vaga. Servidores `fake` só entram quando não há real.
- Cada número = uma instância `<slug>-<aleatório>` com webhook `APP_URL/api/webhooks/evolution/<token>`.
- A Evolution é configurada para **não persistir mensagens**, só a sessão (ver `infra/evolution.env.example`).

### Engine (`src/server/engine/`)

Fluxo de `messages.upsert`:

1. `inbound.ts` valida, deduplica por `external_id`, ignora grupos.
2. `fromMe` com id desconhecido = **humano respondeu pelo celular** → salva como `human`, pausa o bot para o contato por N horas, conversa vira `human`.
3. Mensagem do cliente → `upsertContact`, `getOrCreateConversation` (nova conversa após 12 h de silêncio), transcreve áudio se houver IA, salva, contabiliza.
4. Se o bot deve responder → `scheduler.schedule(numero:contato, debounce)`; várias mensagens seguidas viram uma rodada só.
5. `respondToContact`: pega o lote pendente, faz RAG (`embed` + `<=>` no pgvector; sem chave OpenAI cai para busca textual), monta o prompt (`context.ts`), roda `runLlmTurn` (AI SDK com tools `chamar_atendente`, `enviar_cardapio`, `enviar_localizacao`; sem chave usa o backend simulado), divide em bolhas (`reply.ts`), envia com "digitando", salva mensagens e estatísticas.
6. Fora do horário: manda a mensagem de fora de horário uma vez por conversa e continua respondendo.

Runtime hoje é **em processo** (memória). Para várias réplicas, trocar `MemoryScheduler` por BullMQ/Redis mantendo a interface `Scheduler`.

### Monitor (`src/server/monitor.ts`)

A cada 60 s (iniciado por `instrumentation.ts`) confere a saúde dos servidores e o estado de cada instância, corrige o status no banco e registra eventos. Também exposto em `GET /api/internal/monitor` para cron externo.

### Segurança

- Segredos dos alunos: AES-256-GCM com chave derivada de `APP_SECRET` (`crypto.ts`). Nunca vão ao navegador.
- Sessões próprias (cookie httpOnly + tabela `sessions`), sem serviço externo de auth.
- Webhook autenticado por token aleatório na URL; rotas internas por `INTERNAL_TOKEN`.
- Todo serviço filtra por `accountId` vindo do guard, nunca do cliente.

## Decisões (e por quê)

| Decisão | Motivo |
|---|---|
| Evolution hospedada por nós, não pelo aluno | Fricção mínima para o aluno e um só lugar para atualizar quando o WhatsApp muda o protocolo. Vira receita por número. |
| Conversas no Supabase do aluno | Promessa de privacidade (não temos as conversas) e custo zero de armazenamento para a plataforma. |
| String de conexão em vez de URL + service_role | Um único caminho SQL para dev (PGlite) e produção, e instalação/atualização de tabelas automática, sem o aluno colar SQL. |
| Painel e runtime no mesmo processo | Simplicidade operacional no MVP (um container). A engine não importa nada do Next e pode virar serviço separado depois. |
| Auth própria em vez de Supabase Auth | O produto não depende de um projeto Supabase nosso; roda em qualquer Postgres. |
| AI SDK (Vercel) | Trocar/adicionar provedor (Anthropic, Google) vira configuração. |
