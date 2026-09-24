import Link from "next/link";
import { Hand, MessagesSquare, Tag } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { getPortalOverview } from "@/server/services/portal";
import { TenantNotConfigured } from "@/server/tenant";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Visão geral" };

const PERIODS = [7, 30, 90] as const;

export default async function PortalOverviewPage(props: PageProps<"/portal">) {
  const searchParams = await props.searchParams;
  const diasParam = Number(searchParams.dias);
  const days = PERIODS.includes(diasParam as (typeof PERIODS)[number]) ? diasParam : 30;

  const { client } = await requireClientAccess();

  let overview: Awaited<ReturnType<typeof getPortalOverview>> | null = null;
  try {
    overview = await getPortalOverview(client.accountId, client.id, days);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }

  if (!overview) {
    return (
      <div className="animate-fade-in-up">
        <PageHeader title="Visão geral" />
        <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="Ainda não há dados" description="Assim que o atendimento começar, as conversas aparecem aqui." />
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Visão geral"
        description={`Atendimento de ${client.name}.`}
        actions={
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-1 p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={p === 30 ? "/portal" : `/portal?dias=${p}`}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${p === days ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {p} dias
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Em aberto</span>
            <MessagesSquare className="h-4 w-4 text-subtle" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{formatNumber(overview.open)}</div>
          <div className="mt-1 text-[11px] text-muted">Ainda precisam de um retorno</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Finalizadas ({days} dias)</span>
            <Tag className="h-4 w-4 text-subtle" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{formatNumber(overview.resolvedRecent)}</div>
          <div className="mt-1 text-[11px] text-muted">Marcadas como concluídas no período</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Aguardando atendimento</span>
            <Hand className="h-4 w-4 text-subtle" />
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{formatNumber(overview.needsHuman)}</div>
          <div className="mt-1 text-[11px] text-muted">O bot está em silêncio nelas</div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="border-b border-border px-5 py-4">
          <div className="text-sm font-semibold">Em aberto, por assunto</div>
          <div className="text-xs text-muted">Como o bot categorizou as conversas ainda pendentes.</div>
        </div>
        {overview.categories.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted">Nenhuma conversa em aberto categorizada ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {overview.categories.map((c) => (
              <li key={c.category} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-foreground/90">{c.category}</span>
                <span className="text-muted">{c.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 text-center">
        <Link href="/portal/conversas" className="text-sm text-accent hover:underline">
          Ver todas as conversas
        </Link>
      </div>
    </div>
  );
}
