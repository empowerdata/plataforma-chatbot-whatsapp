import { requireAccount } from "@/server/auth/guards";
import { listAccountUsers } from "@/server/services/accounts";
import { PageHeader } from "@/components/ui/primitives";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { ConfiguracoesClient } from "./configuracoes-client";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const { account, user } = await requireAccount();
  const users = await listAccountUsers(account.id);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Configurações" description="Sua conta, a marca do painel e quem tem acesso." />
      <ConfiguracoesClient
        account={{
          name: account.name,
          slug: account.slug,
          status: account.status,
          includedNumbers: account.plan.includedNumbers,
          maxNumbers: account.plan.maxNumbers,
          expiresAt: account.expiresAt ? formatDateTime(account.expiresAt) : null,
          createdAt: formatDateTime(account.createdAt),
          productName: account.branding?.productName ?? "",
        }}
        // Só campos seguros vão para o navegador (nada de hash de senha).
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          isActive: u.isActive,
          isYou: u.id === user.id,
          lastLogin: u.lastLoginAt ? formatRelative(u.lastLoginAt) : null,
        }))}
      />
    </div>
  );
}
