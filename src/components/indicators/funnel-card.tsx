import type { Funnel } from "@/components/crm/types";
import { cn, formatNumber } from "@/lib/utils";
import { ChartCard } from "./charts";

/**
 * Funil de conversão do período: de quantos chegaram, quantos passaram por
 * cada etapa. Barras numa cor só (a largura é a informação), números sempre
 * visíveis. Ao lado: tempo até agendar/fechar, ganhos e por que se perdeu.
 */
export function FunnelCard({ funnel: f, days }: { funnel: Funnel; days: number }) {
  const reasonsTotal = f.lostReasons.reduce((s, r) => s + r.n, 0);
  return (
    <ChartCard
      className="lg:col-span-3"
      title="Funil de vendas"
      subtitle={`Quem chegou nos últimos ${days} dias e até onde foi`}
      table={{ columns: ["Etapa", "Leads", "% de quem chegou"], rows: f.steps.map((s) => [s.name, s.reached, `${s.pct}%`]) }}
    >
      {f.total === 0 ? (
        <p className="py-10 text-center text-xs text-subtle">Nenhum lead chegou no período.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ol className="space-y-2">
            {f.steps.map((s) => (
              <li key={s.id} className="grid grid-cols-[132px_minmax(0,1fr)_88px] items-center gap-3 text-xs">
                <span className={cn("truncate", s.kind === "won" ? "font-medium text-foreground" : "text-foreground/85")}>{s.name}</span>
                <div className="h-5 bg-surface-2">
                  <div className="h-full rounded-r-[4px] bg-chart-1" style={{ width: s.reached > 0 ? `${Math.max(1.5, s.pct)}%` : 0 }} />
                </div>
                <span className="text-right tabular-nums">
                  <span className="font-medium text-foreground">{formatNumber(s.reached)}</span>
                  <span className="ml-1.5 inline-block w-9 text-subtle">{s.pct}%</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label={f.medianLabel} value={f.medianDays == null ? "—" : f.medianDays < 1 ? "menos de 1 dia" : `${f.medianDays.toFixed(1).replace(".", ",")} dia${f.medianDays >= 1.95 ? "s" : ""}`} hint="mediana" />
              <Stat label="Viraram clientes" value={formatNumber(f.won)} hint={f.wonValue ? `${f.wonValue} em valor` : `${f.total ? Math.round((f.won / f.total) * 100) : 0}% de quem chegou`} />
            </div>
            <div className="rounded-md bg-surface-2/60 px-3 py-2.5">
              <div className="mb-1.5 text-[11.5px] text-muted">Por que não virou</div>
              {f.lostByStage.length === 0 ? (
                <p className="text-xs text-subtle">Nenhuma perda registrada no período.</p>
              ) : (
                <>
                  <p className="text-xs text-foreground/90">{f.lostByStage.map((l) => `${l.name} ${l.n}`).join(" · ")}</p>
                  {f.lostReasons.length ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {f.lostReasons.slice(0, 4).map((r) => (
                        <li key={r.reason} className="flex justify-between text-[11.5px] text-muted">
                          <span className="truncate">{r.reason}</span>
                          <span className="tabular-nums">{reasonsTotal ? Math.round((r.n / reasonsTotal) * 100) : 0}%</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md bg-surface-2/60 px-3 py-2.5">
      <div className="truncate text-[11.5px] text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
      <div className="truncate text-[11px] text-subtle">{hint}</div>
    </div>
  );
}
