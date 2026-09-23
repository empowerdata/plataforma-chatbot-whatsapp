import { notFound } from "next/navigation";
import { requireAccount } from "@/server/auth/guards";
import { listBots } from "@/server/services/bots";
import { listClients } from "@/server/services/clients";
import { listNumberEvents } from "@/server/services/events";
import { getNumber, listNumbers } from "@/server/services/numbers";
import { botVariables } from "@/shared/bot-config";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { NumeroClient, type NumberDetail } from "./numero-client";

export const metadata = { title: "Número" };

export default async function NumeroPage({ params }: PageProps<"/numeros/[id]">) {
  const { id } = await params;
  const { account } = await requireAccount();
  const number = await getNumber(account.id, id);
  if (!number) notFound();

  const [clients, bots, events, all] = await Promise.all([listClients(account.id), listBots(account.id), listNumberEvents(id), listNumbers(account.id)]);
  // listNumbers traz o servidor (nome/tipo) que getNumber não devolve.
  const withNode = all.find((n) => n.number.id === id);
  const bot = number.botId ? bots.find((b) => b.bot.id === number.botId)?.bot : undefined;

  let botVars: string[] = [];
  if (bot) {
    try {
      botVars = botVariables(bot.config);
    } catch {
      botVars = [];
    }
  }

  const detail: NumberDetail = {
    id: number.id,
    label: number.label,
    status: number.status,
    phone: number.phone,
    profileName: number.profileName,
    clientId: number.clientId,
    botId: number.botId,
    botEnabled: number.botEnabled,
    variables: number.variables,
    settings: number.settings,
    nodeName: withNode?.nodeName ?? "—",
    nodeKind: withNode?.nodeKind ?? "http",
    lastError: number.lastError,
    lastMessage: number.lastMessageAt ? formatRelative(number.lastMessageAt) : null,
    createdAt: formatDateTime(number.createdAt),
  };

  return (
    <div className="animate-fade-in-up">
      <NumeroClient
        number={detail}
        clients={clients.map((c) => ({ id: c.client.id, name: c.client.name }))}
        bots={bots.map((b) => ({ id: b.bot.id, name: b.bot.name }))}
        botVars={botVars}
        events={events.map((e) => ({ id: e.id, level: e.level, message: e.message, when: formatRelative(e.createdAt) }))}
      />
    </div>
  );
}
