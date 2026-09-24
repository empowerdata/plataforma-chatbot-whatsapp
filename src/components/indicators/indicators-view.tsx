import { ArrowDownRight, ArrowUpRight, Bot, CheckCheck, Inbox, MessagesSquare } from "lucide-react";
import type { Indicators } from "@/server/services/indicators";
import { cn, formatNumber } from "@/lib/utils";
import { ChartCard, ColumnChart, RankBars, type ColumnDatum } from "./charts";
import { FunnelCard } from "./funnel-card";
import type { Funnel } from "@/components/crm/types";

/*
  Tela de indicadores, igual para equipe e cliente final. Ordem de leitura:
  1) quatro números do período (o que aconteceu e o que está pendente agora);
  2) volume por dia ao lado dos assuntos; 3) horário de pico (e, para a
  equipe, a divisão por cliente).
*/

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

function dayLabel(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

function dayTip(day: string): string {
  const wd = weekday.format(new Date(`${day}T12:00:00Z`)).replace(".", "");
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${dayLabel(day)}`;
}

function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export function IndicatorsView({ data, audience, funnel, funnelHint }: { data: Indicators; audience: "staff" | "client"; funnel?: Funnel | null; /** Equipe sem cliente escolhido: o funil é de um cliente só. */ funnelHint?: boolean }) {
  const { kpis, days } = data;
  const beyondRetention = data.retentionDays > 0 && days > data.retentionDays;
  const retentionNote = beyondRetention ? `Considera os últimos ${data.retentionDays} dias: conversas paradas há mais tempo são apagadas automaticamente.` : null;

  const delta = kpis.startedPrev > 0 ? Math.round(((kpis.started - kpis.startedPrev) / kpis.startedPrev) * 100) : null;
  const botRate = kpis.botOnlyBase > 0 ? Math.round((kpis.botOnly / kpis.botOnlyBase) * 100) : null;

  const daily: ColumnDatum[] = data.daily.map((d) => ({
    key: d.day,
    label: dayLabel(d.day),
    value: d.conversations,
    tip: dayTip(d.day),
    detail: [plural(d.messagesIn, "mensagem recebida", "mensagens recebidas"), ...(d.handoffs ? [plural(d.handoffs, "pedido de atendente", "pedidos de atendente")] : [])],
  }));
  const hours: ColumnDatum[] = data.hours.map((n, h) => ({ key: String(h), label: `${h}h`, value: n, tip: `Das ${h}h às ${(h + 1) % 24}h` }));
  const peak = data.hours.reduce((best, n, h) => (n > data.hours[best] ? h : best), 0);
  const hoursTotal = data.hours.reduce((s, n) => s + n, 0);

  const catTotal = data.categories.reduce((s, c) => s + c.n, 0);
  const catRows = data.categories.map((c) => ({ label: c.category || "Sem categoria", value: c.n, muted: c.category === "" }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Conversas iniciadas"
          icon={MessagesSquare}
          value={formatNumber(kpis.started)}
          sub={
            delta !== null ? (
              <span className="inline-flex items-center gap-1">
                {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-muted" /> : <ArrowDownRight className="h-3.5 w-3.5 text-muted" />}
                <span className="font-medium text-foreground/85">{Math.abs(delta)}%</span> vs. {days} dias anteriores
              </span>
            ) : (
              plural(kpis.newContacts, "contato novo", "contatos novos")
            )
          }
        />
        <Kpi
          label="Em aberto agora"
          icon={Inbox}
          value={formatNumber(kpis.openNow)}
          sub={
            kpis.waitingNow > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                {kpis.waitingNow} aguardando {audience === "client" ? "você" : "a equipe"}
              </span>
            ) : (
              "Nenhuma aguardando resposta"
            )
          }
        />
        <Kpi label="Finalizadas" icon={CheckCheck} value={formatNumber(kpis.resolved)} sub={`Marcadas como concluídas em ${days} dias`} />
        <Kpi
          label="Resolvidas só pelo bot"
          icon={Bot}
          value={botRate !== null ? `${botRate}%` : "—"}
          sub={botRate !== null ? `${formatNumber(kpis.botOnly)} de ${plural(kpis.botOnlyBase, "conversa", "conversas")}, sem a equipe` : "Ainda sem conversas no período"}
        />
      </div>

      {funnel ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <FunnelCard funnel={funnel} days={days} />
        </div>
      ) : funnelHint ? (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-3 text-xs text-muted">Escolha um cliente no filtro acima para ver o funil de vendas dele (de quantos chegaram, quantos agendaram ou fecharam).</p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Conversas por dia"
          subtitle={`Novas conversas nos últimos ${days} dias`}
          table={{ columns: ["Dia", "Conversas", "Mensagens recebidas", "Pedidos de atendente"], rows: [...data.daily].reverse().map((d) => [dayTip(d.day), d.conversations, d.messagesIn, d.handoffs]) }}
        >
          <ColumnChart data={daily} height={196} ariaLabel={`Conversas iniciadas por dia, últimos ${days} dias`} />
        </ChartCard>

        <ChartCard
          title="Assuntos"
          subtitle="Conversas com atividade no período"
          note={retentionNote}
          table={{ columns: ["Categoria", "Conversas", "%"], rows: catRows.map((r) => [r.label, r.value, `${catTotal ? Math.round((r.value / catTotal) * 100) : 0}%`]) }}
        >
          {catRows.length ? <RankBars rows={catRows} total={catTotal} /> : <p className="py-10 text-center text-xs text-subtle">Nenhuma conversa no período</p>}
        </ChartCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          className={data.byClient ? "lg:col-span-2" : "lg:col-span-3"}
          title="Horário das mensagens"
          subtitle={hoursTotal > 0 ? `Mensagens recebidas por hora (Brasília) · pico das ${peak}h às ${(peak + 1) % 24}h` : "Mensagens recebidas por hora (Brasília)"}
          note={retentionNote}
          table={{ columns: ["Horário", "Mensagens recebidas"], rows: data.hours.map((n, h) => [`${String(h).padStart(2, "0")}h–${String((h + 1) % 24).padStart(2, "0")}h`, n]) }}
        >
          <ColumnChart data={hours} height={148} labelEvery={3} ariaLabel="Mensagens recebidas por hora do dia" />
        </ChartCard>

        {data.byClient ? (
          <ChartCard
            title="Por cliente"
            subtitle="Conversas iniciadas no período"
            table={{ columns: ["Cliente", "Conversas"], rows: data.byClient.map((c) => [c.name, c.n]) }}
          >
            <RankBars rows={data.byClient.map((c) => ({ label: c.name, value: c.n, muted: c.name === "Sem cliente" }))} total={kpis.started} />
          </ChartCard>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted">{label}</span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" />
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
      <div className={cn("mt-1 truncate text-[11.5px] text-muted")}>{sub}</div>
    </div>
  );
}
