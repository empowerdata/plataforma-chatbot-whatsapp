import { LogOut } from "lucide-react";
import { requireClientAccess } from "@/server/auth/guards";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/primitives";
import { PortalNav } from "./portal-nav";

// Portal do cliente final: nunca pré-renderizar (depende de sessão + banco).
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { client, account } = await requireClientAccess();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{client.name}</div>
          <div className="truncate text-[11px] text-muted">Atendimento via {account.branding?.productName || "WhatsApp"}</div>
        </div>
        <form action={logoutAction}>
          <Button variant="ghost" size="icon" type="submit" title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </header>
      <PortalNav />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
