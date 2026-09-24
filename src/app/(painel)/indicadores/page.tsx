import Link from "next/link";
import { BarChart3, Database } from "lucide-react";
import { requireAccount } from "@/server/auth/guards";
import { getIndicators, indicatorClients, INDICATOR_PERIODS, parsePeriod } from "@/server/services/indicators";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { IndicatorFilters } from "@/components/indicators/filters";
import { IndicatorsView } from "@/components/indicators/indicators-view";

export const metadata = { title: "Indicadores" };

export default async function IndicadoresPage(props: PageProps<"/indicadores">) {
  const sp = await props.searchParams;
  const days = parsePeriod(sp.dias);
  const { account } = await requireAccount();
  const clients = await indicatorClients(account.id);
  // Só aceita um cliente desta conta; qualquer outra coisa na URL vira "todos".
  const clientId = clients.find((c) => c.id === sp.cl)?.id ?? null;
  const clientName = clientId ? clients.find((c) => c.id === clientId)?.name : null;

  let data: Awaited<ReturnType<typeof getIndicators>> | null = null;
  let noDatabase = false;
  try {
    data = await getIndicators({ accountId: account.id, clientId, staff: true }, days);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
    noDatabase = true;
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Indicadores"
        description={clientName ? `Atendimento de ${clientName}.` : "Atendimento de todos os clientes da conta."}
        actions={<IndicatorFilters basePath="/indicadores" periods={INDICATOR_PERIODS} days={days} clients={clients} clientId={clientId} />}
      />
      {noDatabase ? (
        <EmptyState
          icon={<Database className="h-6 w-6" />}
          title="Banco de dados das conversas não configurado"
          description="Os indicadores saem das conversas guardadas. Configure o banco em Integrações."
          action={
            <Link href="/integracoes" className="text-sm text-accent hover:underline">
              Ir para Integrações
            </Link>
          }
        />
      ) : data?.hasNumbers ? (
        <IndicatorsView data={data} audience="staff" />
      ) : (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="Ainda não há dados"
          description="Conecte um número de WhatsApp para começar a ver os indicadores."
          action={
            <Link href="/numeros" className="text-sm text-accent hover:underline">
              Conectar um número
            </Link>
          }
        />
      )}
    </div>
  );
}
