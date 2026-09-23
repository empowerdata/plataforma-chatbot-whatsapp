import { notFound } from "next/navigation";
import { env } from "@/server/env";
import { requireAccount } from "@/server/auth/guards";
import { listNumbers } from "@/server/services/numbers";
import { PageHeader } from "@/components/ui/primitives";
import { SimuladorClient } from "./simulador-client";

export const metadata = { title: "Simulador" };

export default async function SimuladorPage() {
  if (!env.devSimulator) notFound();
  const { account } = await requireAccount();
  const numbers = await listNumbers(account.id);
  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Simulador de WhatsApp" description="Ambiente de desenvolvimento: faça o papel do cliente e do dono do negócio sem um chip de verdade. Tudo passa pelo mesmo caminho da Evolution real (webhook → bot → resposta)." />
      <SimuladorClient numbers={numbers.map((n) => ({ id: n.number.id, label: n.number.label, status: n.number.status, botName: n.botName, nodeKind: n.nodeKind }))} />
    </div>
  );
}
