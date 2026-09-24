import { LogOut } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/primitives";
import { todayCount } from "@/server/services/crm";
import { PortalNav } from "./portal-nav";

// Portal do cliente final: nunca pré-renderizar (depende de sessão + banco).
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { client, account, user } = await requireClientAccess();
  const pending = await todayCount({ accountId: client.accountId, clientId: client.id, staff: false });

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{client.name}</div>
            <div className="truncate text-[11px] text-muted">Atendimento via {account.branding?.productName || "WhatsApp"}</div>
          </div>
          <PortalNav todayCount={pending} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-sm font-medium text-foreground">{user.name}</div>
            <div className="text-[11px] text-muted">{user.email}</div>
          </div>
          <form action={logoutAction}>
            <Button variant="ghost" size="icon" type="submit" title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto has-[[data-fullbleed]]:overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 has-[[data-fullbleed]]:h-full has-[[data-fullbleed]]:max-w-none has-[[data-fullbleed]]:p-0">{children}</div>
      </main>
    </div>
  );
}
