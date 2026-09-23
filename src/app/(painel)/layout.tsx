import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ensureReady, schema } from "@/server/db";
import { requireUser } from "@/server/auth/guards";
import { getActAsAccountId } from "@/server/auth/session";

// Todo o painel depende da sessão (cookies) e do banco: nunca faz sentido
// pré-renderizar estaticamente. Isso também evita que o build tente abrir o
// banco (Postgres/PGlite) durante "next build".
export const dynamic = "force-dynamic";
import { env } from "@/server/env";
import { Sidebar, type NavItem } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { logoutAction } from "@/app/(auth)/login/actions";
import { stopActingAction } from "./admin/contas/actions";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const db = await ensureReady();
  const user = await requireUser();

  let account: typeof schema.accounts.$inferSelect | null = null;
  let actingAs = false;
  if (user.role === "super_admin") {
    const actAs = await getActAsAccountId();
    if (actAs) {
      account = (await db.select().from(schema.accounts).where(eq(schema.accounts.id, actAs)).limit(1))[0] ?? null;
      actingAs = !!account;
    }
  } else if (user.accountId) {
    account = (await db.select().from(schema.accounts).where(eq(schema.accounts.id, user.accountId)).limit(1))[0] ?? null;
    if (!account) redirect("/login");
    if (account.status !== "active") redirect("/conta-suspensa");
  }

  const sections: { title?: string; items: NavItem[] }[] = [];
  if (account) {
    const items: NavItem[] = [
      { href: "/", label: "Visão geral", icon: "LayoutDashboard" },
      { href: "/numeros", label: "Números", icon: "Smartphone" },
      { href: "/bots", label: "Bots", icon: "Bot" },
      { href: "/clientes", label: "Clientes", icon: "Building2" },
      { href: "/conversas", label: "Conversas", icon: "MessagesSquare" },
      { href: "/integracoes", label: "Integrações", icon: "Plug" },
      { href: "/configuracoes", label: "Configurações", icon: "Settings" },
    ];
    if (env.devSimulator) items.push({ href: "/dev/simulador", label: "Simulador", icon: "FlaskConical" });
    sections.push({ title: account.name, items });
  }
  if (user.role === "super_admin") {
    sections.push({
      title: "Plataforma",
      items: [
        { href: "/admin/contas", label: "Contas", icon: "Users" },
        { href: "/admin/servidores", label: "Servidores", icon: "Server" },
        { href: "/admin/eventos", label: "Eventos", icon: "ScrollText" },
      ],
    });
  }

  const productName = account?.branding?.productName || "Atendimento";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar productName={productName} sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userName={user.name} userEmail={user.email} role={user.role} actingAs={actingAs && account ? { accountName: account.name } : null} onLogout={logoutAction} onStopActing={stopActingAction} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
