"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** Filtros numa linha só, acima dos gráficos: período e (para a equipe) cliente. */
export function IndicatorFilters({
  basePath,
  periods,
  days,
  clients,
  clientId,
}: {
  basePath: string;
  periods: readonly number[];
  days: number;
  clients?: { id: string; name: string }[];
  clientId?: string | null;
}) {
  const router = useRouter();
  const href = (d: number, cl: string | null | undefined) => {
    const sp = new URLSearchParams();
    if (d !== 30) sp.set("dias", String(d));
    if (cl) sp.set("cl", cl);
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {clients && clients.length > 0 ? (
        <select
          value={clientId ?? ""}
          onChange={(e) => router.push(href(days, e.target.value || null))}
          aria-label="Cliente"
          className="h-8 max-w-52 appearance-none rounded-md border border-border bg-surface-1 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238b98a8%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_8px_center] bg-no-repeat pl-2.5 pr-7 text-xs text-foreground focus:border-accent/50 focus:outline-none"
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex items-center rounded-md border border-border bg-surface-1 p-0.5" role="group" aria-label="Período">
        {periods.map((p) => (
          <Link
            key={p}
            href={href(p, clientId)}
            aria-current={p === days ? "true" : undefined}
            className={cn("rounded px-2.5 py-1 text-xs transition-colors", p === days ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground")}
          >
            {p} dias
          </Link>
        ))}
      </div>
    </div>
  );
}
