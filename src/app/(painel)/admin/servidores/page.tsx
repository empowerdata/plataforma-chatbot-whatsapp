import { requireSuperAdmin } from "@/server/auth/guards";
import { listNodes } from "@/server/services/nodes";
import { ServidoresClient, type NodeItem } from "./servidores-client";

export const metadata = { title: "Servidores" };

export default async function ServidoresPage() {
  await requireSuperAdmin();
  const rows = await listNodes();
  const nodes: NodeItem[] = rows.map((r) => ({
    id: r.node.id,
    name: r.node.name,
    kind: r.node.kind,
    baseUrl: r.node.baseUrl,
    capacity: r.node.capacity,
    used: r.used,
    isActive: r.node.isActive,
    lastHealthAt: r.node.lastHealthAt ? r.node.lastHealthAt.toISOString() : null,
    lastHealthOk: r.node.lastHealthOk,
    lastHealthError: r.node.lastHealthError,
    version: r.node.version,
    notes: r.node.notes,
    createdAt: r.node.createdAt.toISOString(),
  }));
  return (
    <div className="animate-fade-in-up">
      <ServidoresClient nodes={nodes} />
    </div>
  );
}
