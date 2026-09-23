import { requireAccount } from "@/server/auth/guards";
import { listNumbers } from "@/server/services/numbers";
import { listClients } from "@/server/services/clients";
import { listBots } from "@/server/services/bots";
import { formatRelative } from "@/lib/utils";
import { NumerosClient } from "./numeros-client";

export const metadata = { title: "Números" };

export default async function NumerosPage() {
  const { account } = await requireAccount();
  const [numbers, clients, bots] = await Promise.all([listNumbers(account.id), listClients(account.id), listBots(account.id)]);

  return (
    <div className="animate-fade-in-up">
      <NumerosClient
        numbers={numbers.map((n) => ({
          id: n.number.id,
          label: n.number.label,
          status: n.number.status,
          phone: n.number.phone,
          clientName: n.clientName,
          botName: n.botName,
          nodeKind: n.nodeKind,
          lastError: n.number.lastError,
          lastMessage: n.number.lastMessageAt ? formatRelative(n.number.lastMessageAt) : null,
        }))}
        clients={clients.map((c) => ({ id: c.client.id, name: c.client.name }))}
        hasBots={bots.length > 0}
      />
    </div>
  );
}
