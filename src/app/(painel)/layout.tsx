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

  // Login de cliente final (portal escopado a um client_id) nunca vê o painel da equipe.
  if (user.role === "client") redirect("/portal/conversas");

  // "Administrador da plataforma" de verdade só é quem NÃO tem conta própria
  // vinculada — ou seja, gerencia várias contas hospedadas por fora. Numa
  // instalação de conta única, quem instalou é super_admin mas já tem a
  // própria conta (bootstrapCore) e nunca deveria ver essa camada extra.
  const isPlatformAdmin = user.role === "super_admin" && !user.accountId;

  let account: typeof schema.accounts.$inferSelect | null = null;
  let actingAs = false;
  if (user.role === "super_admin") {
    const actAs = await getActAsAccountId();
    // Sem "entrar como" explícito: cai na própria conta, se tiver uma (caso
    // da instalação de conta única, onde quem instalou já é dono dela).
    const targetId = actAs ?? user.accountId;
    if (targetId) {
      account = (await db.select().from(schema.accounts).where(eq(schema.accounts.id, targetId)).limit(1))[0] ?? null;
      actingAs = !!actAs && !!account;
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
      { href: "/indicadores", label: "Indicadores", icon: "BarChart3" },
      { href: "/integracoes", label: "Integrações", icon: "Plug" },
      { href: "/configuracoes", label: "Configurações", icon: "Settings" },
    ];
    if (env.devSimulator) items.push({ href: "/dev/simulador", label: "Simulador", icon: "FlaskConical" });
    sections.push({ title: account.name, items });
  }
  if (isPlatformAdmin) {
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
        <Topbar userName={user.name} userEmail={user.email} isPlatformAdmin={isPlatformAdmin} actingAs={actingAs && account ? { accountName: account.name } : null} onLogout={logoutAction} onStopActing={stopActingAction} />
        {/* Telas "de ponta a ponta" (a caixa de entrada) marcam data-fullbleed e ocupam a área toda, sem margem nem largura máxima. */}
        <main className="min-h-0 flex-1 overflow-y-auto has-[[data-fullbleed]]:overflow-hidden">
          <div className="mx-auto w-full max-w-6xl px-6 py-6 has-[[data-fullbleed]]:h-full has-[[data-fullbleed]]:max-w-none has-[[data-fullbleed]]:p-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
