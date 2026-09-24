import Link from "next/link";
import { Database } from "lucide-react";
import { requireAccount } from "@/server/auth/guards";
import { listNumbers } from "@/server/services/numbers";
import { listConversations, listUsedCategories } from "@/server/services/conversations";
import { TenantNotConfigured } from "@/server/tenant";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatPhone, formatRelative } from "@/lib/utils";
import { ConversasClient, type ConversationRow } from "./conversas-client";

export const metadata = { title: "Conversas" };

export default async function ConversasPage(props: PageProps<"/conversas">) {
  const searchParams = await props.searchParams;
  const { account } = await requireAccount();
  const numbers = await listNumbers(account.id);

  // Só aceita um número que pertença à conta (evita erro de uuid inválido no banco do aluno).
  const numeroParam = typeof searchParams.numero === "string" ? searchParams.numero : undefined;
  const numberId = numeroParam && numbers.some((n) => n.number.id === numeroParam) ? numeroParam : undefined;
  const needsHuman = searchParams.humano === "1";
  const category = typeof searchParams.categoria === "string" ? searchParams.categoria : undefined;

  let rows: ConversationRow[] = [];
  let categories: string[] = [];
  let problem: { title: string; description: string } | null = null;
  try {
    const [items, cats] = await Promise.all([listConversations(account.id, { numberId, needsHuman, category, limit: 100 }), listUsedCategories(account.id)]);
    categories = cats;
    rows = items.map((c) => {
      const name = c.contact_name ?? c.contact_push_name ?? null;
      return {
        id: c.id,
        title: name ?? formatPhone(c.contact_phone),
        phone: name && c.contact_phone ? formatPhone(c.contact_phone) : null,
        numberLabel: c.numberLabel,
        preview: c.last_message_preview,
        status: c.status,
        needsHuman: c.needs_human,
        category: c.category,
        lastMessageAt: formatRelative(c.last_message_at),
        messageCount: Number(c.message_count ?? 0),
      };
    });
  } catch (err) {
    if (err instanceof TenantNotConfigured) {
      problem = { title: "Supabase ainda não conectado", description: "As conversas ficam guardadas no banco de dados da sua conta. Conecte o seu Supabase em Integrações para vê-las aqui." };
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      problem = { title: "Não foi possível acessar as conversas", description: `${msg.endsWith(".") ? msg : `${msg}.`} Confira a conexão com o Supabase em Integrações.` };
    }
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Conversas" description="Tudo o que os bots e a sua equipe conversaram com os clientes." />
      {problem ? (
        <EmptyState
          icon={<Database className="h-6 w-6" />}
          title={problem.title}
          description={problem.description}
          action={
            <Link href="/integracoes" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-strong">
              Ir para Integrações
            </Link>
          }
        />
      ) : (
        <ConversasClient numbers={numbers.map((n) => ({ id: n.number.id, label: n.number.label }))} numberId={numberId ?? null} needsHuman={needsHuman} category={category ?? null} categories={categories} rows={rows} />
      )}
    </div>
  );
}
