import { requireAccount } from "@/server/auth/guards";
import { listClients } from "@/server/services/clients";
import { formatRelative } from "@/lib/utils";
import { ClientesClient } from "./clientes-client";

export const metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const { account } = await requireAccount();
  const rows = await listClients(account.id);

  return (
    <div className="animate-fade-in-up">
      <ClientesClient
        clients={rows.map((r) => ({
          id: r.client.id,
          name: r.client.name,
          segment: r.client.segment,
          contactName: r.client.contactName,
          contactPhone: r.client.contactPhone,
          city: r.client.city,
          notes: r.client.notes,
          numbers: r.numbers,
          connected: r.connected,
          createdAt: formatRelative(r.client.createdAt),
        }))}
      />
    </div>
  );
}
