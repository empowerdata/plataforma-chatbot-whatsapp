import { Database } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { getInboxConversation, listInbox, parseInboxParams, type InboxScope } from "@/server/services/inbox";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState } from "@/components/ui/primitives";
import { Inbox } from "@/components/inbox/inbox";
import { renameContactAction, saveNotesAction, sendMessageAction, setBlockedAction, setBotAction, setCategoryAction, setResolvedAction } from "./actions";

export const metadata = { title: "Conversas" };

export default async function PortalConversasPage(props: PageProps<"/portal/conversas">) {
  const { client } = await requireClientAccess();
  const { filters, selectedId } = parseInboxParams(await props.searchParams);
  // Escopo sempre do login (client_id), nunca da URL.
  const scope: InboxScope = { accountId: client.accountId, clientId: client.id, staff: false };

  let loaded: [Awaited<ReturnType<typeof listInbox>>, Awaited<ReturnType<typeof getInboxConversation>>] | null = null;
  try {
    loaded = await Promise.all([listInbox(scope, filters), selectedId ? getInboxConversation(scope, selectedId) : Promise.resolve(null)]);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }

  if (!loaded) {
    return (
      <div className="p-6">
        <EmptyState icon={<Database className="h-6 w-6" />} title="Ainda não disponível" description="O atendimento ainda não está pronto. Fale com quem administra o seu WhatsApp." />
      </div>
    );
  }

  const [inbox, selected] = loaded;
  return (
    <Inbox
      basePath="/portal/conversas"
      audience="client"
      list={inbox.items}
      counts={inbox.counts}
      categories={inbox.categories}
      numbers={inbox.numbers}
      clients={inbox.clients}
      hasMore={inbox.hasMore}
      noNumbers={inbox.noNumbers}
      filters={filters}
      selectedId={selectedId}
      selected={selected}
      actions={{
        setResolved: setResolvedAction,
        setCategory: setCategoryAction,
        setBot: setBotAction,
        send: sendMessageAction,
        saveNotes: saveNotesAction,
        rename: renameContactAction,
        setBlocked: setBlockedAction,
      }}
      emptyHint="O seu WhatsApp ainda não foi conectado. Fale com quem administra o seu atendimento."
    />
  );
}
