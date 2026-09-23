import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { LoginForm } from "./login-form";

// Lê a sessão e o banco: nunca pré-renderizar estaticamente.
export const dynamic = "force-dynamic";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getSessionUser();
  if (user) redirect(user.role === "super_admin" ? "/admin/contas" : "/");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Entrar na plataforma</h1>
          <p className="mt-1 text-sm text-muted">Gestão de atendimento por WhatsApp</p>
        </div>
        <LoginForm next={next} demo={env.devSimulator ? { admin: env.BOOTSTRAP_ADMIN_EMAIL, adminPassword: env.BOOTSTRAP_ADMIN_PASSWORD } : null} />
      </div>
    </main>
  );
}
