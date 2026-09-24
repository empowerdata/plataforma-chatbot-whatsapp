# Convenções do projeto

Leia antes de criar qualquer tela. Vale para pessoas e para agentes.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts` no lugar de middleware), React 19, TypeScript, Tailwind v4.
- `cookies()`, `headers()`, `params` e `searchParams` são **assíncronos** (sempre `await`). Tipos de página: `PageProps<"/rota/[id]">`; rotas de API: `RouteContext<"/api/x/[id]">` (gerados por `npx next typegen`).
- Banco do plano de controle: Drizzle (`src/server/db/schema.ts`). Em dev é PGlite em `./.data`; em produção `DATABASE_URL`.
- Banco do aluno (conversas, contatos, conhecimento): `src/server/tenant` (SQL puro, `TenantStore`). **Nunca** escrever SQL de tenant fora dessa pasta.
- Segredos dos alunos sempre passam por `encryptSecret`/`decryptSecret` (`src/server/crypto.ts`) e **nunca** chegam ao navegador.

## Estrutura de uma tela (padrão CRUD)

```
src/app/(painel)/<secao>/
  page.tsx        → Server Component: guarda + busca dados via services + renderiza <SecaoClient />
  <secao>-client.tsx → "use client": estado local, modais, chama actions
  actions.ts      → "use server": uma função por operação, SEMPRE devolvendo { error: string | null, data? }
```

Regras:

- **Guardas**: em páginas use `requireAccount()` (devolve `{ user, account, actingAs }`) ou `requireSuperAdmin()`. Em actions/rotas use `getAccountOrThrow()` / `getSuperAdminOrThrow()` (lançam em vez de redirecionar).
- **Toda action recebe o `account.id` do guard, nunca do cliente.** Serviços sempre filtram por `accountId`.
- Depois de mutar, `revalidatePath("/secao")` e devolva `{ error: null }`. Erros: capture e devolva `{ error: mensagem }` em português, sem stack.
- Lógica de negócio fica em `src/server/services/*`; actions são finas.
- Não passe funções de Server Component para Client Component (RSC não serializa). Passe ids/strings.

## UI

- Componentes base em `src/components/ui/primitives.tsx` (Button, Input, Textarea, Select, Field, Switch, Badge, StatusDot, Card, CardHeader, PageHeader, EmptyState, Spinner, CopyBox), `dialog.tsx` (Modal, DialogsProvider/useDialogs), `toast.tsx` (useToast), `tabs.tsx` (Tabs).
- **Nunca usar `window.confirm/prompt/alert`.** Use `const { confirmDialog, promptDialog, alertDialog } = useDialogs()`.
- Feedback de ação: `useToast().success("...")` / `.error("...")`.
- Ícones: `lucide-react`.
- Cores só pelos tokens do `globals.css` (`bg-surface-1`, `text-muted`, `border-border`, `text-accent`, `bg-danger-soft`…). **Nunca** `slate-*`, `zinc-*`, `indigo-*` etc.
- Estilo sóbrio (Linear): sem gradientes, sem glow. Cor carrega estado, não decoração. Hover = superfície/borda. Animações só `animate-fade-in-up` (entrada) e `animate-scale-in` (modal).
- Textos em português do Brasil, diretos, sem jargão técnico para o aluno. Erros dizem o que fazer.
- Layout: a página fica dentro de `max-w-6xl`; use `PageHeader` no topo. Estados vazios sempre com `EmptyState` explicando o próximo passo.
- Números de status: use `numberStatusMeta(status)` para rótulo/cor.
- Datas: `formatDateTime`, `formatRelative`, telefones: `formatPhone` (em `src/lib/utils.ts`).

## Verificação antes de dizer "pronto"

1. `npx tsc --noEmit` sem erros.
2. `npm run build` passa (o build pega erros de RSC que o tsc não pega).
3. Abrir no navegador e testar de verdade (dev: `npm run dev`, login `demo@local.test` / `demo123`).

Gráficos: os componentes de `src/components/indicators/charts.tsx` (`ChartCard`, `ColumnChart`, `RankBars`). Uma cor por gráfico (`chart-1`; `chart-muted` para "sem categoria"/"outras"), nunca uma cor por categoria; texto nas cores de texto, nunca na da série; grade em linha fina contínua; todo gráfico com a versão em tabela (`table` do `ChartCard`).

Datas na tela: sempre pelos formatadores de `src/lib/utils.ts` (`formatDateTime`, `formatTime`, `formatListTime`, `formatDayLabel`), que fixam o fuso `America/Sao_Paulo` — o servidor roda em UTC. Telas de ponta a ponta (como a caixa de entrada) marcam o elemento raiz com `data-fullbleed` para ocupar a área inteira do layout.

## Serviços disponíveis (src/server/services)

- `accounts.ts`: listAccounts, getAccount, createAccount, updateAccount, listAccountUsers, createAccountUser, createPasswordSetupLink, setUserActive.
- `integrations.ts`: getIntegrationView (inclui `usingServerDb`), saveSupabaseUrl, recheckSupabase, removeSupabase, saveOpenAiKey, recheckOpenAi, setOpenAiModel, removeOpenAi. Modelos: `CHAT_MODEL_OPTIONS` em `src/server/ai/provider.ts`.
- `clients.ts`: listClients, getClient, createClient, updateClient, deleteClient, listClientPortalUsers, createClientPortalUser, setClientPortalUserActive, newClientPortalSetupLink.
- `numbers.ts`: listNumbers, getNumber, createNumber, getConnectionInfo, reconnectNumber, disconnectNumber, deleteNumber, updateNumber, assignBot. Rota de polling: `GET /api/numeros/[id]/conexao?refresh=1`.
- `bots.ts`: listBots, getBot, createBot, updateBot, publishBot, duplicateBot, deleteBot. Modelos por nicho: `botTemplates` em `src/shared/bot-config.ts`.
- `knowledge.ts`: listKnowledge, addTextItem, addFaqItem, addFileItem, addUrlItem, updateItem, deleteItem, reindexItem, reindexBot.
- `inbox.ts` (caixa de entrada da equipe e do portal, sempre com um `InboxScope`): parseInboxParams, listInbox, getInboxConversation, setInboxResolved, setInboxCategory, setInboxBot, sendInboxMessage, saveInboxNotes, renameInboxContact, setInboxBlocked. A tela é `src/components/inbox/` (usada por `/conversas` e `/portal/conversas`, cada uma passando as próprias server actions).
- `indicators.ts` (indicadores da equipe e do portal): getIndicators(scope, dias), indicatorClients, parsePeriod. A tela é `src/components/indicators/` (usada por `/indicadores` e `/portal`).
- `stats.ts`: getOverview(accountId, days).
- `events.ts`: logEvent, listEvents, listNumberEvents.
- Playground do Studio: `POST /api/playground` com `{ botId, config, variables, history, userText }`.
- Simulador (dev): `POST /api/dev/simulador` ações `scan | disconnect | incoming | human`; `GET ?numberId&phone` devolve a conversa.
