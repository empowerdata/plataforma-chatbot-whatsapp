import { getPasswordTokenUser } from "@/server/services/accounts";
import { Card } from "@/components/ui/primitives";
import { SetPasswordForm } from "./set-password-form";

// Consulta o banco a cada acesso (token de uso único): nunca pré-renderizar.
export const dynamic = "force-dynamic";

export const metadata = { title: "Definir senha" };

export default async function DefinirSenhaPage({ params }: PageProps<"/definir-senha/[token]">) {
  const { token } = await params;
  const user = await getPasswordTokenUser(token);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">{user ? `Olá, ${user.name.split(" ")[0]}` : "Link inválido"}</h1>
          <p className="mt-1 text-sm text-muted">{user ? "Crie sua senha para acessar a plataforma." : "Este link expirou ou já foi usado. Peça um novo ao administrador."}</p>
        </div>
        {user ? (
          <Card className="p-6">
            <SetPasswordForm token={token} email={user.email} />
          </Card>
        ) : null}
      </div>
    </main>
  );
}
