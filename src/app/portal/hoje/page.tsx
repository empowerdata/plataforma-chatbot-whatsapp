import { Database } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { getToday, type CrmScope } from "@/server/services/crm";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState } from "@/components/ui/primitives";
import { TodayScreen } from "@/components/crm/today";
import { completeNextActionAction, deleteLeadAction, moveLeadAction, saveStagesAction, updateLeadAction } from "../funil/actions";

export const metadata = { title: "Hoje" };

export default async function PortalHojePage() {
  const { client } = await requireClientAccess();
  const scope: CrmScope = { accountId: client.accountId, clientId: client.id, staff: false };

  let data: Awaited<ReturnType<typeof getToday>> | null = null;
  try {
    data = await getToday(scope);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }
  if (!data) return <EmptyState icon={<Database className="h-6 w-6" />} title="Ainda não disponível" description="O atendimento ainda não está pronto. Fale com quem administra o seu WhatsApp." />;

  return (
    <TodayScreen
      data={data}
      actions={{ move: moveLeadAction, update: updateLeadAction, completeNextAction: completeNextActionAction, saveStages: saveStagesAction, deleteLead: deleteLeadAction }}
      leadHref={`/portal/funil?lead=`}
      conversationHref={`/portal/conversas?v=todas&c=`}
      funnelHref="/portal/funil"
    />
  );
}
