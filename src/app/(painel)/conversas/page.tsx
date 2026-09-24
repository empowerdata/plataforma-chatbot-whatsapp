import Link from "next/link";
import { Database } from "lucide-react";
import { requireAccount } from "@/server/auth/guards";
import { getInboxConversation, listInbox, parseInboxParams, type InboxScope } from "@/server/services/inbox";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState } from "@/components/ui/primitives";
import { Inbox } from "@/components/inbox/inbox";
import { renameContactAction, saveNotesAction, sendMessageAction, setBlockedAction, setBotAction, setCategoryAction, setResolvedAction } from "./actions";

export const metadata = { title: "Conversas" };

export default async function ConversasPage(props: PageProps<"/conversas">) {
  const { account } = await requireAccount();
  const { filters, selectedId } = parseInboxParams(await props.searchParams);
  const scope: InboxScope = { accountId: account.id, clientId: null, staff: true };

  let loaded: [Awaited<ReturnType<typeof listInbox>>, Awaited<ReturnType<typeof getInboxConversation>>] | null = null;
  try {
    loaded = await Promise.all([listInbox(scope, filters), selectedId ? getInboxConversation(scope, selectedId) : Promise.resolve(null)]);
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
  }

  if (!loaded) {
    return (
      <EmptyState
        icon={<Database className="h-6 w-6" />}
        title="Banco de dados das conversas não configurado"
        description="As conversas ficam guardadas num banco de dados. Configure em Integrações para vê-las aqui."
        action={
          <Link href="/integracoes" className="text-sm text-accent hover:underline">
            Ir para Integrações
          </Link>
        }
      />
    );
  }

  const [inbox, selected] = loaded;
  return (
    <Inbox
      basePath="/conversas"
      audience="staff"
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
      emptyHint={
        <>
          Nenhum número ainda.{" "}
          <Link href="/numeros" className="text-accent hover:underline">
            Conectar um WhatsApp
          </Link>
        </>
      }
    />
  );
}
