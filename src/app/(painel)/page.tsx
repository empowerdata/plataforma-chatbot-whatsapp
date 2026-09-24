import Link from "next/link";
import { MessagesSquare, Smartphone, UserPlus, Hand, Bot, ArrowRight, AlertTriangle } from "lucide-react";
import { requireAccount } from "@/server/auth/guards";
import { getOverview } from "@/server/services/stats";
import { getIntegrationView } from "@/server/services/integrations";
import { listEvents } from "@/server/services/events";
import { listClients } from "@/server/services/clients";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusDot } from "@/components/ui/primitives";
import { numberStatusMeta } from "@/components/ui/status";
import { formatNumber, formatRelative } from "@/lib/utils";
import { ActivityChart } from "./activity-chart";

export const metadata = { title: "Visão geral" };

const PERIODS = [7, 30, 90] as const;

export default async function OverviewPage(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const diasParam = Number(searchParams.dias);
  const days = PERIODS.includes(diasParam as (typeof PERIODS)[number]) ? diasParam : 30;

  const { account } = await requireAccount();
  const [overview, integrations, events, clients] = await Promise.all([getOverview(account.id, days), getIntegrationView(account.id), listEvents(account.id, 8), listClients(account.id)]);

  const databaseReady = integrations.supabase.configured || integrations.supabase.usingServerDb || integrations.supabase.usingLocalDev;
  const setup = [
    // Numa instalação própria o banco já vem pronto; o passo só aparece se faltar mesmo.
    ...(databaseReady ? [] : [{ done: false, label: "Configurar o banco de dados das conversas", href: "/integracoes" }]),
    { done: integrations.openai.configured || integrations.openai.usingDevKey, label: "Conectar a OpenAI", href: "/integracoes" },
    { done: clients.length > 0, label: "Cadastrar o primeiro cliente (o negócio que você atende)", href: "/clientes" },
    { done: overview.numbers.length > 0, label: "Adicionar o número de WhatsApp do cliente", href: "/numeros" },
    { done: overview.numbers.some((n) => n.botName), label: "Atribuir um bot ao número", href: "/bots" },
  ];
  const pendingSetup = setup.filter((s) => !s.done);
  const connected = overview.numbers.filter((n) => n.status === "open").length;
  const disconnected = overview.numbers.filter((n) => n.status === "close").length;

  const kpis = [
    { label: `Conversas (${days} dias)`, value: overview.totals.conversations, today: overview.today.conversations, icon: MessagesSquare },
    { label: `Mensagens (${days} dias)`, value: overview.totals.messagesIn + overview.totals.messagesOut, today: overview.today.messagesIn + overview.today.messagesOut, icon: Bot },
    { label: "Novos contatos", value: overview.totals.newContacts, today: null, icon: UserPlus },
    { label: "Pedidos de humano", value: overview.totals.handoffs, today: overview.today.handoffs, icon: Hand },
  ];

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Visão geral"
        description={`Atividade dos últimos ${days} dias em ${account.name}.`}
        actions={
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-1 p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={p === 30 ? "/" : `/?dias=${p}`}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${p === days ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {p} dias
              </Link>
            ))}
          </div>
        }
      />

      {pendingSetup.length ? (
        <Card className="mb-6 border-accent/30 bg-accent-soft/40 p-4">
          <div className="mb-2 text-sm font-semibold">Primeiros passos</div>
          <ol className="grid gap-2 sm:grid-cols-2">
            {setup.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${s.done ? "bg-success text-white" : "bg-surface-3 text-muted"}`}>{s.done ? "✓" : i + 1}</span>
                {s.done ? <span className="text-muted line-through">{s.label}</span> : (
                  <Link href={s.href} className="text-foreground hover:text-accent">
                    {s.label} <ArrowRight className="ml-0.5 inline h-3.5 w-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{k.label}</span>
              <k.icon className="h-4 w-4 text-subtle" />
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{formatNumber(k.value)}</div>
            {k.today !== null ? <div className="mt-1 text-[11px] text-muted">{formatNumber(k.today)} hoje</div> : <div className="mt-1 text-[11px] text-muted">{formatNumber(overview.contacts)} contatos no total</div>}
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Atividade" description="Conversas e mensagens por dia" />
          <div className="px-5 py-4">
            {overview.series.some((d) => d.messages > 0) ? <ActivityChart series={overview.series} /> : <p className="py-10 text-center text-sm text-muted">Ainda não há mensagens. Conecte um número e o gráfico aparece aqui.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Números"
            description={`${connected} conectado${connected === 1 ? "" : "s"}${disconnected ? `, ${disconnected} desconectado${disconnected === 1 ? "" : "s"}` : ""}`}
            action={
              <Link href="/numeros" className="text-xs text-accent hover:underline">
                ver todos
              </Link>
            }
          />
          <div className="divide-y divide-border">
            {overview.numbers.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={<Smartphone className="h-6 w-6" />} title="Nenhum número" description="Adicione o WhatsApp do seu primeiro cliente." />
              </div>
            ) : (
              overview.numbers.slice(0, 6).map((n) => {
                const meta = numberStatusMeta(n.status);
                return (
                  <Link key={n.id} href={`/numeros/${n.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                    <StatusDot tone={meta.tone} pulse={meta.pulse} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{n.label}</div>
                      <div className="truncate text-[11px] text-muted">{n.clientName ?? "sem cliente"} · {n.botName ?? "sem bot"}</div>
                    </div>
                    <div className="text-right text-[11px] text-muted">
                      <div>{formatNumber(n.conversations)} conv.</div>
                      <div>{n.lastMessageAt ? formatRelative(n.lastMessageAt) : "—"}</div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Últimos eventos" description="Conexões, avisos e erros" />
          <ul className="divide-y divide-border">
            {events.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-muted">Nada por aqui ainda.</li>
            ) : (
              events.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  {e.level === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : e.level === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : <StatusDot tone="neutral" />}
                  <span className="flex-1 text-foreground/90">{e.message}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatRelative(e.createdAt)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Atendimento humano" description="Conversas esperando alguém da equipe" />
          <div className="p-5">
            <div className="text-3xl font-semibold">{formatNumber(overview.needsHuman)}</div>
            <p className="mt-1 text-xs text-muted">O bot fica em silêncio nessas conversas até a equipe responder ou você liberar.</p>
            <Link href="/conversas?humano=1" className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
              Ver conversas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            {overview.totals.tokensIn + overview.totals.tokensOut > 0 ? (
              <div className="mt-5 border-t border-border pt-4 text-xs text-muted">
                <Badge tone="neutral">IA</Badge> <span className="ml-1">{formatNumber(overview.totals.tokensIn + overview.totals.tokensOut)} tokens nos últimos 30 dias</span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
