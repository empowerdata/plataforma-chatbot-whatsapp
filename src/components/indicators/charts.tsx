"use client";

import * as React from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

/*
  Gráficos dos indicadores. Regras (skill dataviz):
  - série única numa cor só (chart-1); "sem categoria" / resto em chart-muted;
  - marcas finas: barra de no máximo 24px, ponta arredondada de 4px e base reta;
  - grade em linha fina contínua; texto sempre nas cores de texto, nunca na da série;
  - dica ao passar o mouse, mas nenhum valor depende dela: todo gráfico tem a
    mesma informação em tabela (botão no canto do cartão).
*/

// ------------------------------------------------------------------ cartão

export type TableSpec = { columns: string[]; rows: (string | number)[][] };

export function ChartCard({
  title,
  subtitle,
  table,
  note,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  table: TableSpec;
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = React.useState(false);
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-surface-1", className)}>
      <header className="flex items-start justify-between gap-3 px-4 pb-1 pt-3.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 rounded-md border border-border p-0.5" role="group" aria-label="Forma de exibição">
          <ToggleButton active={!asTable} onClick={() => setAsTable(false)} label="Ver gráfico">
            <BarChart3 className="h-3.5 w-3.5" />
          </ToggleButton>
          <ToggleButton active={asTable} onClick={() => setAsTable(true)} label="Ver tabela">
            <Table2 className="h-3.5 w-3.5" />
          </ToggleButton>
        </div>
      </header>
      <div className="min-h-0 flex-1 px-4 pb-4 pt-2">{asTable ? <DataTable spec={table} /> : children}</div>
      {note ? <footer className="border-t border-border px-4 py-2 text-[11px] text-subtle">{note}</footer> : null}
    </section>
  );
}

function ToggleButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      aria-label={label}
      className={cn("rounded px-1.5 py-1 transition-colors", active ? "bg-surface-3 text-foreground" : "text-subtle hover:text-foreground")}
    >
      {children}
    </button>
  );
}

function DataTable({ spec }: { spec: TableSpec }) {
  return (
    <div className="max-h-64 overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-2 text-muted">
          <tr>
            {spec.columns.map((c, i) => (
              <th key={c} className={cn("px-3 py-1.5 font-medium", i === 0 ? "text-left" : "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {spec.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={cn("px-3 py-1.5", j === 0 ? "text-left text-foreground/90" : "text-right tabular-nums text-muted")}>
                  {typeof cell === "number" ? formatNumber(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------ colunas (SVG)

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Escala com passos "redondos" (1, 2, 5 × 10ⁿ) e só inteiros — são contagens. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const rough = max / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

/** Barra com ponta arredondada (4px) e base reta, apoiada no eixo. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export type ColumnDatum = { key: string; label: string; value: number; tip: string; detail?: string[] };

export function ColumnChart({ data, height = 168, labelEvery, ariaLabel }: { data: ColumnDatum[]; height?: number; labelEvery?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);

  const padL = 30;
  const padR = 4;
  const padT = 8;
  const padB = 20;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const { top, ticks } = niceScale(Math.max(0, ...data.map((d) => d.value)));
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.64));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const h = hover !== null ? data[hover] : null;
  const hx = hover !== null ? padL + hover * band + band / 2 : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="stroke-chart-grid" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-subtle text-[10px] tabular-nums">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {hover !== null ? <rect x={padL + hover * band} y={padT} width={band} height={innerH} className="fill-surface-2" /> : null}
          {data.map((d, i) => {
            const x = padL + i * band + (band - barW) / 2;
            const bh = (d.value / top) * innerH;
            return (
              <g key={d.key}>
                {bh > 0 ? <path d={barPath(x, padT + innerH - bh, barW, bh)} className={cn("fill-chart-1 transition-opacity", hover !== null && hover !== i && "opacity-45")} /> : null}
                {i % every === 0 ? (
                  <text x={padL + i * band + band / 2} y={height - 5} textAnchor="middle" className="fill-subtle text-[10px]">
                    {d.label}
                  </text>
                ) : null}
                {/* Área de toque maior que a barra: a coluna inteira. */}
                <rect x={padL + i * band} y={padT} width={band} height={innerH + padB} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
      ) : null}
      {width > 0 && data.every((d) => d.value === 0) ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 pl-8 text-center text-xs text-subtle">Nada registrado no período</div>
      ) : null}
      {h ? (
        <div
          className="pointer-events-none absolute z-10 min-w-32 whitespace-nowrap rounded-md border border-border-strong bg-surface-3 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(hx, 70), Math.max(70, width - 70)), top: Math.max(0, y(h.value) - 8), transform: "translate(-50%, -100%)" }}
        >
          <div className="text-[11px] text-muted">{h.tip}</div>
          <div className="font-semibold tabular-nums text-foreground">{formatNumber(h.value)}</div>
          {h.detail?.map((line) => (
            <div key={line} className="text-[11px] text-muted">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------- barras deitadas

export type RankRow = { label: string; value: number; muted?: boolean };

/** Ranking em barras horizontais, com valor e fatia sempre visíveis. */
export function RankBars({ rows, total, max = 8 }: { rows: RankRow[]; total: number; max?: number }) {
  // Mais de `max` itens: o resto vira "Outras", em cinza (nunca uma cor nova).
  const shown = rows.length > max ? [...rows.slice(0, max - 1), { label: "Outras", value: rows.slice(max - 1).reduce((s, r) => s + r.value, 0), muted: true }] : rows;
  const top = Math.max(1, ...shown.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {shown.map((r) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
        return (
          <li key={r.label} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className={cn("truncate", r.muted ? "text-muted" : "text-foreground/90")}>{r.label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                <span className="font-medium text-foreground">{formatNumber(r.value)}</span>
                <span className="ml-1.5 inline-block w-8 text-right text-subtle">{pct}%</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-surface-2">
              <div className={cn("h-full rounded-r-[3px] transition-[width] duration-500", r.muted ? "bg-chart-muted" : "bg-chart-1")} style={{ width: r.value > 0 ? `${Math.max(1.5, (r.value / top) * 100)}%` : 0 }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
