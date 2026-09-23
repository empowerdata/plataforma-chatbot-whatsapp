"use client";

import * as React from "react";

type Point = { day: string; conversations: number; messages: number; handoffs: number };

/** Gráfico de barras leve (SVG inline, sem dependências). */
export function ActivityChart({ series }: { series: Point[] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const W = 720;
  const H = 180;
  const padL = 28;
  const padB = 22;
  const innerW = W - padL - 8;
  const innerH = H - padB - 8;
  const max = Math.max(1, ...series.map((p) => p.messages));
  const barW = innerW / series.length;
  const ticks = [0, Math.round(max / 2), max];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Mensagens por dia">
        {ticks.map((t) => {
          const y = 8 + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="currentColor" className="text-border-strong" strokeDasharray="2 4" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="fill-current text-[9px] text-subtle">
                {t}
              </text>
            </g>
          );
        })}
        {series.map((p, i) => {
          const hMsg = (p.messages / max) * innerH;
          const hConv = (p.conversations / max) * innerH;
          const x = padL + i * barW + barW * 0.2;
          const w = barW * 0.6;
          const active = hover === i;
          return (
            <g key={p.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * barW} y={8} width={barW} height={innerH} fill="transparent" />
              <rect x={x} y={8 + innerH - hMsg} width={w} height={hMsg} rx={2} className={active ? "fill-accent" : "fill-accent/50"} />
              <rect x={x} y={8 + innerH - hConv} width={w} height={hConv} rx={2} className="fill-foreground/70" />
              {i % Math.ceil(series.length / 8) === 0 ? (
                <text x={x + w / 2} y={H - 6} textAnchor="middle" className="fill-current text-[9px] text-subtle">
                  {p.day.slice(8, 10)}/{p.day.slice(5, 7)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-accent/60" /> mensagens</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-foreground/70" /> conversas</span>
        {hover !== null ? (
          <span className="ml-auto text-foreground">
            {series[hover].day.split("-").reverse().join("/")}: {series[hover].messages} msgs, {series[hover].conversations} conversas{series[hover].handoffs ? `, ${series[hover].handoffs} p/ humano` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
