"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Hand, MessagesSquare } from "lucide-react";
import { Badge, Button, EmptyState, Select, Spinner } from "@/components/ui/primitives";

export type PortalConversationRow = {
  id: string;
  title: string;
  phone: string | null;
  numberLabel: string;
  preview: string | null;
  needsHuman: boolean;
  category: string | null;
  resolved: boolean;
  lastMessageAt: string;
  messageCount: number;
};

export function PortalConversasClient({
  category,
  categories,
  resolved,
  rows,
}: {
  category: string | null;
  categories: string[];
  resolved: boolean | null;
  rows: PortalConversationRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const apply = (next: { category: string | null; resolved: boolean | null }) => {
    const qs = new URLSearchParams();
    if (next.category) qs.set("categoria", next.category);
    if (next.resolved !== null) qs.set("resolvido", next.resolved ? "1" : "0");
    const search = qs.toString();
    startTransition(() => router.replace(search ? `/portal/conversas?${search}` : "/portal/conversas"));
  };

  const filtered = category !== null || resolved !== null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={resolved === null ? "" : resolved ? "1" : "0"} onChange={(e) => apply({ category, resolved: e.target.value === "" ? null : e.target.value === "1" })} className="w-40" aria-label="Filtrar por status">
          <option value="">Aberto e finalizado</option>
          <option value="0">Em aberto</option>
          <option value="1">Finalizado</option>
        </Select>
        {categories.length > 0 ? (
          <Select value={category ?? ""} onChange={(e) => apply({ category: e.target.value || null, resolved })} className="w-48" aria-label="Filtrar por categoria">
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        ) : null}
        {pending ? <Spinner /> : null}
        <span className="ml-auto text-xs text-muted">{rows.length === 1 ? "1 conversa" : `${rows.length} conversas`}</span>
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<MessagesSquare className="h-6 w-6" />}
            title="Nenhuma conversa com esses filtros"
            action={
              <Button variant="secondary" size="sm" onClick={() => apply({ category: null, resolved: null })}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="Nenhuma conversa ainda" description="Assim que alguém escrever para o seu número, a conversa aparece aqui." />
        )
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-surface-1">
          {rows.map((c) => (
            <Link key={c.id} href={`/portal/conversas/${c.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{c.title}</span>
                  {c.phone ? <span className="text-xs text-muted">{c.phone}</span> : null}
                  {c.category ? <Badge tone="neutral">{c.category}</Badge> : null}
                  {c.resolved ? <Badge tone="success">finalizada</Badge> : null}
                  {c.needsHuman ? (
                    <Badge tone="warning">
                      <Hand className="mr-1 h-3 w-3" /> precisa de retorno
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">{c.preview ?? "Sem mensagens ainda."}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="hidden text-right text-[11px] text-muted sm:block">
                  <div>{c.lastMessageAt}</div>
                  <div>
                    {c.messageCount} {c.messageCount === 1 ? "msg" : "msgs"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-subtle" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
