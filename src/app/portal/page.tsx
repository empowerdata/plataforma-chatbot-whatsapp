import { BarChart3 } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { getIndicators, INDICATOR_PERIODS, parsePeriod } from "@/server/services/indicators";
import { getFunnel } from "@/server/services/crm";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { IndicatorFilters } from "@/components/indicators/filters";
import { IndicatorsView } from "@/components/indicators/indicators-view";

export const metadata = { title: "Indicadores" };

export default async function PortalIndicatorsPage(props: PageProps<"/portal">) {
  const days = parsePeriod((await props.searchParams).dias);
  const { client } = await requireClientAccess();

  let data: Awaited<ReturnType<typeof getIndicators>> | null = null;
  let funnel: Awaited<ReturnType<typeof getFunnel>> | null = null;
  try {
    // Escopo sempre do login (client_id), nunca da URL.
    const scope = { accountId: client.accountId, clientId: client.id, staff: false };
    [data, funnel] = await Promise.all([getIndicators(scope, days), getFunnel(scope, days)]);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Indicadores" description={`Atendimento de ${client.name} no WhatsApp.`} actions={<IndicatorFilters basePath="/portal" periods={INDICATOR_PERIODS} days={days} />} />
      {data?.hasNumbers ? (
        <IndicatorsView data={data} audience="client" funnel={funnel} />
      ) : (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Ainda não há dados" description="Assim que o atendimento começar, os números aparecem aqui." />
      )}
    </div>
  );
}
