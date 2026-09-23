import { requireSuperAdmin } from "@/server/auth/guards";
import { listAllEvents, type EventLevel } from "@/server/services/events";
import { EventosClient, type EventItem } from "./eventos-client";

export const metadata = { title: "Eventos" };

export default async function EventosPage({ searchParams }: PageProps<"/admin/eventos">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const nivelParam = typeof sp.nivel === "string" ? sp.nivel : undefined;
  const nivel: EventLevel | undefined = nivelParam === "warn" || nivelParam === "error" ? nivelParam : undefined;
  const rows = await listAllEvents(200, nivel);
  const events: EventItem[] = rows.map((e) => ({
    id: e.id,
    level: e.level,
    type: e.type,
    message: e.message,
    accountName: e.accountName,
    createdAt: e.createdAt.toISOString(),
  }));
  return (
    <div className="animate-fade-in-up">
      <EventosClient events={events} nivel={nivel ?? null} />
    </div>
  );
}
