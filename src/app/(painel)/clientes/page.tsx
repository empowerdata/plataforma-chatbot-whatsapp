import { requireAccount } from "@/server/auth/guards";
import { listClients, listClientPortalUsers } from "@/server/services/clients";
import { formatRelative } from "@/lib/utils";
import { ClientesClient } from "./clientes-client";

export const metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const { account } = await requireAccount();
  const [rows, portalUsers] = await Promise.all([listClients(account.id), listClientPortalUsers(account.id)]);

  return (
    <div className="animate-fade-in-up">
      <ClientesClient
        clients={rows.map((r) => {
          const portal = portalUsers[r.client.id];
          return {
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
            portalUser: portal ? { id: portal.id, name: portal.name, email: portal.email, isActive: portal.isActive } : null,
          };
        })}
      />
    </div>
  );
}
