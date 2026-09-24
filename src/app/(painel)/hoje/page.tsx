import Link from "next/link";
import { Building2, Database } from "lucide-react";
import { requireAccount } from "@/server/auth/guards";
import { crmClients, getToday, type CrmScope } from "@/server/services/crm";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState } from "@/components/ui/primitives";
import { TodayScreen } from "@/components/crm/today";
import { ClientPicker } from "@/components/crm/client-picker";
import { completeNextActionAction, deleteLeadAction, moveLeadAction, saveStagesAction, updateLeadAction } from "../funil/actions";

export const metadata = { title: "Hoje" };

export default async function HojePage(props: PageProps<"/hoje">) {
  const sp = await props.searchParams;
  const { account } = await requireAccount();
  const clients = await crmClients(account.id);
  if (!clients.length) {
    return (
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        title="Nenhum cliente ainda"
        description="A lista do dia é de cada cliente. Cadastre o primeiro para começar."
        action={
          <Link href="/clientes" className="text-sm text-accent hover:underline">
            Cadastrar cliente
          </Link>
        }
      />
    );
  }
  const clientId = clients.find((c) => c.id === sp.cl)?.id ?? clients[0].id;
  const scope: CrmScope = { accountId: account.id, clientId, staff: true };

  let data: Awaited<ReturnType<typeof getToday>> | null = null;
  try {
    data = await getToday(scope);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }
  if (!data) return <EmptyState icon={<Database className="h-6 w-6" />} title="Banco de dados das conversas não configurado" description="Configure o banco em Integrações." />;

  return (
    <TodayScreen
      data={data}
      leadHref={`/funil?cl=${clientId}&lead=`}
      conversationHref={`/conversas?v=todas&c=`}
      funnelHref={`/funil?cl=${clientId}`}
      clientSelect={<ClientPicker key="cliente" clients={clients} value={clientId} basePath="/hoje" />}
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
