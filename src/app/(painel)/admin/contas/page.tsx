import { requireSuperAdmin } from "@/server/auth/guards";
import { listAccounts } from "@/server/services/accounts";
import { ContasClient, type AccountItem } from "./contas-client";

export const metadata = { title: "Contas" };

export default async function ContasPage() {
  await requireSuperAdmin();
  const rows = await listAccounts();
  const accounts: AccountItem[] = rows.map((r) => ({
    id: r.account.id,
    name: r.account.name,
    slug: r.account.slug,
    status: r.account.status,
    includedNumbers: r.account.plan.includedNumbers,
    maxNumbers: r.account.plan.maxNumbers,
    notes: r.account.notes,
    productName: r.account.branding?.productName ?? "",
    expiresAt: r.account.expiresAt ? r.account.expiresAt.toISOString() : null,
    createdAt: r.account.createdAt.toISOString(),
    numbers: r.numbers,
    bots: r.bots,
    users: r.users,
    supabaseStatus: r.supabaseStatus,
    openaiStatus: r.openaiStatus,
  }));
  return (
    <div className="animate-fade-in-up">
      <ContasClient accounts={accounts} />
    </div>
  );
}
