import Link from "next/link";
import { Card } from "@/components/ui/primitives";

export default function ContaSuspensaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md p-6 text-center animate-fade-in-up">
        <h1 className="text-lg font-semibold">Conta suspensa</h1>
        <p className="mt-2 text-sm text-muted">O acesso desta conta está suspenso. Fale com o administrador da plataforma para reativar.</p>
        <Link href="/login" className="mt-4 inline-block text-sm text-accent hover:underline">
          Voltar ao login
        </Link>
      </Card>
    </main>
  );
}
