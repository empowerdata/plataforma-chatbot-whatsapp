/**
 * PLANO DE DADOS — instalado no Supabase (Postgres) de cada aluno.
 * Versão 1. Idempotente: pode rodar quantas vezes for preciso.
 * Tudo fica no schema "chatbot" para não misturar com o resto do projeto do aluno.
 *
 * Fica num módulo TS (e não num .sql) para ir junto no build standalone.
 * Ao alterar: crie TENANT_SCHEMA_V2 com só o delta, adicione em MIGRATIONS
 * (registry.ts) e incremente TENANT_SCHEMA_VERSION.
 */
export const TENANT_SCHEMA_V1 = `
create extension if not exists vector;
create schema if not exists chatbot;

create table if not exists chatbot.meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists chatbot.contacts (
  id uuid primary key default gen_random_uuid(),
  number_id uuid not null,
  jid text not null,
  phone text,
  name text,
  push_name text,
  is_blocked boolean not null default false,
  bot_paused_until timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (number_id, jid)
);
create index if not exists contacts_number_idx on chatbot.contacts (number_id, last_seen_at desc);

create table if not exists chatbot.conversations (
  id uuid primary key default gen_random_uuid(),
  number_id uuid not null,
  contact_id uuid not null references chatbot.contacts (id) on delete cascade,
  status text not null default 'open',
  needs_human boolean not null default false,
  handoff_reason text,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  message_count integer not null default 0,
  bot_message_count integer not null default 0,
  human_message_count integer not null default 0,
  summary text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists conversations_number_last_idx on chatbot.conversations (number_id, last_message_at desc);
create index if not exists conversations_contact_idx on chatbot.conversations (contact_id, created_at desc);

create table if not exists chatbot.messages (
  id uuid primary key default gen_random_uuid(),
  number_id uuid not null,
  conversation_id uuid not null references chatbot.conversations (id) on delete cascade,
  contact_id uuid not null references chatbot.contacts (id) on delete cascade,
  external_id text,
  direction text not null,
  sender text not null,
  type text not null default 'text',
  text text,
  transcript text,
  media_mime text,
  status text not null default 'received',
  model text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  meta jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists messages_external_idx on chatbot.messages (number_id, external_id) where external_id is not null;
create index if not exists messages_conversation_idx on chatbot.messages (conversation_id, created_at);
create index if not exists messages_number_created_idx on chatbot.messages (number_id, created_at desc);

create table if not exists chatbot.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null,
  item_id uuid not null,
  ord integer not null default 0,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists kb_chunks_bot_idx on chatbot.kb_chunks (bot_id);
create index if not exists kb_chunks_item_idx on chatbot.kb_chunks (item_id);

do $$
begin
  create index if not exists kb_chunks_embedding_idx on chatbot.kb_chunks using hnsw (embedding vector_cosine_ops);
exception when others then
  raise notice 'índice hnsw não criado: %', sqlerrm;
end $$;

create table if not exists chatbot.daily_stats (
  number_id uuid not null,
  day date not null,
  conversations integer not null default 0,
  messages_in integer not null default 0,
  messages_out integer not null default 0,
  bot_messages integer not null default 0,
  human_messages integer not null default 0,
  new_contacts integer not null default 0,
  handoffs integer not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (number_id, day)
);

alter table chatbot.contacts enable row level security;
alter table chatbot.conversations enable row level security;
alter table chatbot.messages enable row level security;
alter table chatbot.kb_chunks enable row level security;
alter table chatbot.daily_stats enable row level security;
alter table chatbot.meta enable row level security;

insert into chatbot.meta (key, value)
values ('schema_version', '1')
on conflict (key) do update set value = excluded.value, updated_at = now();
`;

/** v2: categoria da conversa (o bot categoriza sozinho, dá para corrigir na mão). */
export const TENANT_SCHEMA_V2 = `
alter table chatbot.conversations add column if not exists category text;
create index if not exists conversations_category_idx on chatbot.conversations (number_id, category) where category is not null;

insert into chatbot.meta (key, value)
values ('schema_version', '2')
on conflict (key) do update set value = excluded.value, updated_at = now();
`;

/**
 * v3: status de CRM (aberto/finalizado), independente do "status" técnico do
 * atendimento (open/human/closed, que controla o bot). Uma conversa pode
 * ficar tecnicamente "closed" por timeout e continuar em aberto como lead —
 * por isso é um campo separado, marcado à mão pela equipe ou pelo cliente
 * no portal.
 */
export const TENANT_SCHEMA_V3 = `
alter table chatbot.conversations add column if not exists resolved_at timestamptz;
create index if not exists conversations_resolved_idx on chatbot.conversations (number_id, resolved_at);

insert into chatbot.meta (key, value)
values ('schema_version', '3')
on conflict (key) do update set value = excluded.value, updated_at = now();
`;

/**
 * v4: inbox. `bot_disabled` é o interruptor explícito "bot nesta conversa"
 * (desligado por uma pessoa, sem prazo — diferente de `bot_paused_until`,
 * que é a pausa automática com hora para voltar). `notes` são as notas
 * internas sobre o contato, que o cliente nunca vê.
 */
export const TENANT_SCHEMA_V4 = `
alter table chatbot.contacts add column if not exists bot_disabled boolean not null default false;
alter table chatbot.contacts add column if not exists notes text;

insert into chatbot.meta (key, value)
values ('schema_version', '4')
on conflict (key) do update set value = excluded.value, updated_at = now();
`;

/**
 * v5: CRM (funil de leads). Um lead é uma pessoa por cliente do aluno (o mesmo
 * telefone em dois números do mesmo negócio é um lead só) e sobrevive às
 * conversas: guarda etapa, próxima ação, agendamento, valor e notas. As
 * etapas são por cliente (vêm de um modelo pelo segmento e podem ser
 * editadas). `lead_events` é o histórico de cada lead — o funil do período
 * é calculado a partir dele, então continua certo mesmo se um cartão voltar
 * de etapa. `client_id` vem do plano de controle (o banco das conversas não
 * tem a tabela de clientes).
 *
 * `suggested_category`: a categoria que o bot sugere; a categoria de verdade
 * (`category`) é a que uma pessoa confirmou.
 */
export const TENANT_SCHEMA_V5 = `
create table if not exists chatbot.crm_stages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  name text not null,
  kind text not null default 'open',
  position integer not null default 0,
  asks_date boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists crm_stages_client_idx on chatbot.crm_stages (client_id, position);

create table if not exists chatbot.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  phone text not null,
  name text,
  stage_id uuid references chatbot.crm_stages (id) on delete set null,
  interest text,
  value_cents integer,
  notes text,
  next_action_at timestamptz,
  next_action_note text,
  appointment_at timestamptz,
  lost_reason text,
  source text,
  last_contact_id uuid,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (client_id, phone)
);
create index if not exists leads_client_stage_idx on chatbot.leads (client_id, stage_id, stage_changed_at desc);
create index if not exists leads_client_next_idx on chatbot.leads (client_id, next_action_at);
create index if not exists leads_client_appt_idx on chatbot.leads (client_id, appointment_at);

create table if not exists chatbot.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references chatbot.leads (id) on delete cascade,
  type text not null,
  from_stage uuid,
  to_stage uuid,
  actor text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on chatbot.lead_events (lead_id, created_at);

alter table chatbot.contacts add column if not exists lead_id uuid;
create index if not exists messages_contact_created_idx on chatbot.messages (contact_id, created_at desc);
create index if not exists contacts_lead_idx on chatbot.contacts (lead_id);
alter table chatbot.conversations add column if not exists suggested_category text;

alter table chatbot.crm_stages enable row level security;
alter table chatbot.leads enable row level security;
alter table chatbot.lead_events enable row level security;

insert into chatbot.meta (key, value)
values ('schema_version', '5')
on conflict (key) do update set value = excluded.value, updated_at = now();
`;
