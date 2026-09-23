import { requireAccount } from "@/server/auth/guards";
import { getIntegrationView } from "@/server/services/integrations";
import { CHAT_MODEL_OPTIONS } from "@/server/ai/provider";
import { PageHeader } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { IntegracoesClient, type IntegrationsView } from "./integracoes-client";

export const metadata = { title: "Integrações" };

export default async function IntegracoesPage() {
  const { account } = await requireAccount();
  const view = await getIntegrationView(account.id);

  // Só dados simples vão para o cliente (nada de segredos; datas já formatadas).
  const data: IntegrationsView = {
    supabase: {
      configured: view.supabase.configured,
      status: view.supabase.status,
      error: view.supabase.error,
      checkedAt: view.supabase.checkedAt ? formatRelative(view.supabase.checkedAt) : null,
      schemaVersion: view.supabase.schemaVersion,
      latestVersion: view.supabase.latestVersion,
      masked: view.supabase.masked,
      usingLocalDev: view.supabase.usingLocalDev,
    },
    openai: {
      configured: view.openai.configured,
      status: view.openai.status,
      error: view.openai.error,
      checkedAt: view.openai.checkedAt ? formatRelative(view.openai.checkedAt) : null,
      masked: view.openai.masked,
      model: view.openai.model,
      usingDevKey: view.openai.usingDevKey,
    },
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Integrações" description="Conecte o banco de dados das conversas e a inteligência do bot. Os segredos ficam criptografados e nunca aparecem no navegador." />
      <IntegracoesClient view={data} models={CHAT_MODEL_OPTIONS} />
    </div>
  );
}
