import { Database } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { getBoard, getLeadDetail, parseBoardParams, type CrmScope } from "@/server/services/crm";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState } from "@/components/ui/primitives";
import { CrmBoardScreen } from "@/components/crm/board";
import { completeNextActionAction, deleteLeadAction, moveLeadAction, saveStagesAction, updateLeadAction } from "./actions";

export const metadata = { title: "Funil" };

export default async function PortalFunilPage(props: PageProps<"/portal/funil">) {
  const { client } = await requireClientAccess();
  const { leadId, ...filters } = parseBoardParams(await props.searchParams);
  // Escopo sempre do login (client_id), nunca da URL.
  const scope: CrmScope = { accountId: client.accountId, clientId: client.id, staff: false };

  let loaded: [Awaited<ReturnType<typeof getBoard>>, Awaited<ReturnType<typeof getLeadDetail>>] | null = null;
  try {
    loaded = await Promise.all([getBoard(scope, filters), leadId ? getLeadDetail(scope, leadId) : Promise.resolve(null)]);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }

  if (!loaded) {
    return <EmptyState icon={<Database className="h-6 w-6" />} title="Ainda não disponível" description="O atendimento ainda não está pronto. Fale com quem administra o seu WhatsApp." />;
  }

  const [board, lead] = loaded;
  return (
    <CrmBoardScreen
      basePath="/portal/funil"
      board={board}
      filters={filters}
      lead={lead}
      conversationBase="/portal/conversas?v=todas"
      actions={{ move: moveLeadAction, update: updateLeadAction, completeNextAction: completeNextActionAction, saveStages: saveStagesAction, deleteLead: deleteLeadAction }}
    />
  );
}
