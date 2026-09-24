import Link from "next/link";
import { Building2, Database } from "lucide-react";
import { requireAccount } from "@/server/auth/guards";
import { crmClients, getBoard, getLeadDetail, parseBoardParams, type CrmScope } from "@/server/services/crm";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState } from "@/components/ui/primitives";
import { CrmBoardScreen } from "@/components/crm/board";
import { ClientPicker } from "@/components/crm/client-picker";
import { completeNextActionAction, deleteLeadAction, moveLeadAction, saveStagesAction, updateLeadAction } from "./actions";

export const metadata = { title: "Funil" };

export default async function FunilPage(props: PageProps<"/funil">) {
  const sp = await props.searchParams;
  const { account } = await requireAccount();
  const clients = await crmClients(account.id);
  if (!clients.length) {
    return (
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        title="Nenhum cliente ainda"
        description="O funil é de cada cliente (o negócio que você atende). Cadastre o primeiro para começar."
        action={
          <Link href="/clientes" className="text-sm text-accent hover:underline">
            Cadastrar cliente
          </Link>
        }
      />
    );
  }
  // O funil é sempre de um cliente: o da URL, se for desta conta, ou o primeiro.
  const clientId = clients.find((c) => c.id === sp.cl)?.id ?? clients[0].id;
  const { leadId, ...filters } = parseBoardParams(sp);
  const scope: CrmScope = { accountId: account.id, clientId, staff: true };

  let loaded: [Awaited<ReturnType<typeof getBoard>>, Awaited<ReturnType<typeof getLeadDetail>>] | null = null;
  try {
    loaded = await Promise.all([getBoard(scope, filters), leadId ? getLeadDetail(scope, leadId) : Promise.resolve(null)]);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }
  if (!loaded) {
    return <EmptyState icon={<Database className="h-6 w-6" />} title="Banco de dados das conversas não configurado" description="O funil sai das conversas guardadas. Configure o banco em Integrações." />;
  }

  const [board, lead] = loaded;
  return (
    <CrmBoardScreen
      basePath="/funil"
      keepParams={{ cl: clientId }}
      board={board}
      filters={filters}
      lead={lead}
      conversationBase="/conversas?v=todas"
      clientSelect={<ClientPicker key="cliente" clients={clients} value={clientId} basePath="/funil" />}
      actions={{
        move: moveLeadAction.bind(null, clientId),
        update: updateLeadAction.bind(null, clientId),
        completeNextAction: completeNextActionAction.bind(null, clientId),
        saveStages: saveStagesAction.bind(null, clientId),
        deleteLead: deleteLeadAction.bind(null, clientId),
      }}
    />
  );
}
