"use client";

import Link from "next/link";
import { AlertTriangle, ScrollText } from "lucide-react";
import { Badge, EmptyState, StatusDot } from "@/components/ui/primitives";
import { formatDateTime, formatRelative } from "@/lib/utils";

export type EventItem = {
  id: string;
  level: "info" | "warn" | "error";
  type: string;
  message: string;
  accountName: string | null;
  createdAt: string;
};

const FILTERS: { value: "" | "warn" | "error"; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "warn", label: "Avisos" },
  { value: "error", label: "Erros" },
];

export function EventosClient({ events, nivel }: { events: EventItem[]; nivel: "warn" | "error" | null }) {
  const current = nivel ?? "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Eventos</h1>
          <p className="mt-1 text-sm text-muted">Conexões, avisos e erros de todas as contas.</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 p-0.5">
          {FILTERS.map((f) => {
            const active = current === f.value;
            return (
              <Link
                key={f.value}
                href={f.value ? `/admin/eventos?nivel=${f.value}` : "/admin/eventos"}
                className={
                  active
                    ? "rounded px-2.5 py-1 text-xs font-medium bg-surface-1 text-foreground shadow-sm"
                    : "rounded px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
                }
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="Nenhum evento"
          description="Ainda não há eventos registrados com esse filtro."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface-1">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              {e.level === "error" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              ) : e.level === "warn" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : (
                <span className="mt-1.5 shrink-0">
                  <StatusDot tone="neutral" />
                </span>
              )}
              <Badge tone="neutral" className="shrink-0">
                {e.accountName ?? "plataforma"}
              </Badge>
              <span className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{e.type}</span>
              <span className="min-w-0 flex-1 text-foreground/90">{e.message}</span>
              <span className="shrink-0 text-[11px] text-muted" title={formatDateTime(e.createdAt)}>
                {formatRelative(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
