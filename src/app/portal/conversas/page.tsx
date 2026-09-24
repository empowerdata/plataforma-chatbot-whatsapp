import { requireClientAccess } from "@/server/auth/guards";
import { listPortalConversations, listPortalUsedCategories } from "@/server/services/portal";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { Database } from "lucide-react";
import { formatPhone, formatRelative } from "@/lib/utils";
import { PortalConversasClient, type PortalConversationRow } from "./conversas-client";

export const metadata = { title: "Conversas" };

export default async function PortalConversasPage(props: PageProps<"/portal/conversas">) {
  const searchParams = await props.searchParams;
  const { client } = await requireClientAccess();

  const category = typeof searchParams.categoria === "string" ? searchParams.categoria : undefined;
  const resolvidoParam = searchParams.resolvido;
  const resolved = resolvidoParam === "1" ? true : resolvidoParam === "0" ? false : undefined;

  let rows: PortalConversationRow[] = [];
  let categories: string[] = [];
  let problem: string | null = null;
  try {
    const [items, cats] = await Promise.all([
      listPortalConversations(client.accountId, client.id, { category, resolved, limit: 100 }),
      listPortalUsedCategories(client.accountId, client.id),
    ]);
    categories = cats;
    rows = items.map((c) => {
      const name = c.contact_name ?? c.contact_push_name ?? null;
      return {
        id: c.id,
        title: name ?? formatPhone(c.contact_phone),
        phone: name && c.contact_phone ? formatPhone(c.contact_phone) : null,
        numberLabel: c.numberLabel,
        preview: c.last_message_preview,
        needsHuman: c.needs_human,
        category: c.category,
        resolved: c.resolved_at != null,
        lastMessageAt: formatRelative(c.last_message_at),
        messageCount: Number(c.message_count ?? 0),
      };
    });
  } catch (err) {
    if (!(err instanceof TenantNotConfigured)) throw err;
    problem = "O atendimento ainda não está disponível. Fale com quem administra o seu WhatsApp.";
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Conversas" description="Tudo o que o bot e a equipe conversaram com seus contatos." />
      {problem ? (
        <EmptyState icon={<Database className="h-6 w-6" />} title="Ainda não disponível" description={problem} />
      ) : (
        <PortalConversasClient category={category ?? null} categories={categories} resolved={resolved ?? null} rows={rows} />
      )}
    </div>
  );
}
