"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select, StatusDot } from "@/components/ui/primitives";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  recheckOpenAiAction,
  recheckSupabaseAction,
  removeOpenAiAction,
  removeSupabaseAction,
  saveOpenAiKeyAction,
  saveSupabaseUrlAction,
  setOpenAiModelAction,
} from "./actions";

type IntegrationStatus = "unconfigured" | "ok" | "error";

export type IntegrationsView = {
  supabase: {
    configured: boolean;
    status: IntegrationStatus;
    error: string | null;
    checkedAt: string | null;
    schemaVersion: number;
    latestVersion: number;
    masked: string | null;
    usingServerDb: boolean;
    usingLocalDev: boolean;
  };
  openai: {
    configured: boolean;
    status: IntegrationStatus;
    error: string | null;
    checkedAt: string | null;
    masked: string | null;
    model: string;
    usingDevKey: boolean;
  };
};

type ModelOption = { id: string; label: string; hint: string };

function statusMeta(status: IntegrationStatus): { tone: "neutral" | "success" | "danger"; label: string } {
  switch (status) {
    case "ok":
      return { tone: "success", label: "Conectado" };
    case "error":
      return { tone: "danger", label: "Erro" };
    default:
      return { tone: "neutral", label: "Não configurado" };
  }
}

/** Bloco recolhível simples (sem lib extra), estilo sóbrio do design system. */
function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-md border border-border bg-surface-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-3 text-xs text-muted">{children}</div>
    </details>
  );
}

function InfoBanner({ tone = "info", children }: { tone?: "info" | "warning"; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs", tone === "info" ? "border-info/30 bg-info-soft text-info" : "border-warning/30 bg-warning-soft text-warning")}>
      {tone === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

export function IntegracoesClient({ view, models }: { view: IntegrationsView; models: ModelOption[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <OpenAiCard data={view.openai} models={models} />
      <SupabaseCard data={view.supabase} />
    </div>
  );
}

// ---------------------------------------------------------------- Supabase

function SupabaseCard({ data }: { data: IntegrationsView["supabase"] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog } = useDialogs();
  const [url, setUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const meta = statusMeta(data.status);
  const hasUpdate = data.configured && data.schemaVersion < data.latestVersion;

  async function handleSave() {
    if (!url.trim()) {
      toast.error("Cole a string de conexão do seu projeto Supabase.");
      return;
    }
    setSaving(true);
    try {
      const res = await saveSupabaseUrlAction(url.trim());
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Supabase conectado e tabelas instaladas.");
        setUrl("");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRecheck() {
    setTesting(true);
    try {
      const res = await recheckSupabaseAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success("Conexão verificada.");
        router.refresh();
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    const ok = await confirmDialog("As conversas antigas continuam no seu Supabase; a plataforma só deixa de acessá-las e as novas passam a ficar no banco do próprio servidor.", {
      title: "Remover a conexão com o Supabase?",
      destructive: true,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    setRemoving(true);
    try {
      const res = await removeSupabaseAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success("Conexão com o Supabase removida.");
        router.refresh();
      }
    } finally {
      setRemoving(false);
    }
  }

  const serverDbActive = data.usingServerDb && !data.configured;

  const supabaseForm = (
    <>
      <Field label="String de conexão do Supabase" hint="Session pooler, com a senha do banco no lugar de [YOUR-PASSWORD].">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="postgresql://postgres.xxxx:[SUA-SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={saving} onClick={handleSave}>
          {saving ? "Conectando e criando tabelas…" : "Conectar e instalar"}
        </Button>
        {data.configured ? (
          <>
            <Button size="sm" variant="outline" loading={testing} onClick={handleRecheck}>
              Testar novamente
            </Button>
            <Button size="sm" variant="danger" loading={removing} onClick={handleRemove}>
              Remover
            </Button>
          </>
        ) : null}
      </div>

      <Collapsible title="Onde encontro a string de conexão?">
        <ol className="list-decimal space-y-1 pl-4">
          <li>Crie um projeto gratuito em supabase.com (guarde a senha do banco).</li>
          <li>No projeto, clique em &quot;Connect&quot; no topo.</li>
          <li>Escolha &quot;Session pooler&quot; e copie a URI.</li>
          <li>Troque [YOUR-PASSWORD] pela senha do banco.</li>
          <li>Cole aqui.</li>
        </ol>
        <p>Esqueceu a senha? Redefina em Project Settings → Database, dentro do seu projeto Supabase.</p>
      </Collapsible>
    </>
  );

  return (
    <Card>
      <CardHeader
        title="Banco de dados"
        description="Onde as conversas e contatos ficam guardados."
        action={
          serverDbActive ? (
            <Badge tone="success">
              <StatusDot tone="success" /> Ativo
            </Badge>
          ) : (
            <Badge tone={meta.tone}>
              <StatusDot tone={meta.tone === "danger" ? "danger" : meta.tone === "success" ? "success" : "neutral"} /> {meta.label}
            </Badge>
          )
        }
      />
      <div className="space-y-4 p-5">
        {data.usingLocalDev ? <InfoBanner>Ambiente de desenvolvimento: usando um banco local até você conectar um Supabase.</InfoBanner> : null}

        {serverDbActive ? (
          <>
            <div className="rounded-md border border-success/25 bg-success-soft px-3 py-2.5 text-xs text-foreground/90">
              Usando o banco de dados do seu próprio servidor — não precisa configurar nada. As conversas ficam guardadas no seu servidor, com cópia de segurança diária.
            </div>
            <Collapsible title="Avançado: guardar as conversas num Supabase próprio">
              <p>Opcional. Útil se você quer ver as tabelas pelo painel do Supabase ou manter as conversas fora do servidor. Sem isso, está tudo funcionando.</p>
              <div className="space-y-3 pt-1">{supabaseForm}</div>
            </Collapsible>
          </>
        ) : null}

        {!serverDbActive && data.configured ? (
          <div className="space-y-1.5 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs">
            <div className="truncate font-mono text-foreground">{data.masked}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              {data.checkedAt ? <span>verificado {data.checkedAt}</span> : null}
              <span>tabelas v{data.schemaVersion}</span>
              {hasUpdate ? <Badge tone="warning">atualização disponível</Badge> : null}
            </div>
            {data.error ? <p className="text-danger">{data.error}</p> : null}
            {hasUpdate ? (
              <Button size="sm" variant="outline" loading={testing} onClick={handleRecheck} className="mt-1">
                Instalar atualização das tabelas
              </Button>
            ) : null}
          </div>
        ) : data.error ? (
          <p className="text-xs text-danger">{data.error}</p>
        ) : null}

        {serverDbActive ? null : supabaseForm}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ OpenAI

function OpenAiCard({ data, models }: { data: IntegrationsView["openai"]; models: ModelOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog } = useDialogs();
  const [key, setKey] = React.useState("");
  const [modelDraft, setModelDraft] = React.useState(data.model);
  const [modelOnly, setModelOnly] = React.useState(data.model);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [savingModel, setSavingModel] = React.useState(false);
  const meta = statusMeta(data.status);
  const noKeyAtAll = !data.configured && !data.usingDevKey;

  async function handleSave() {
    if (!key.trim()) {
      toast.error("Cole a chave da API da OpenAI.");
      return;
    }
    setSaving(true);
    try {
      const res = await saveOpenAiKeyAction(key.trim(), modelDraft);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Chave da OpenAI salva e testada.");
        setKey("");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRecheck() {
    setTesting(true);
    try {
      const res = await recheckOpenAiAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success("Chave verificada.");
        router.refresh();
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    const ok = await confirmDialog("O bot passa a responder de forma simulada até você configurar uma nova chave.", {
      title: "Remover a chave da OpenAI?",
      destructive: true,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    setRemoving(true);
    try {
      const res = await removeOpenAiAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success("Chave da OpenAI removida.");
        router.refresh();
      }
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveModel() {
    setSavingModel(true);
    try {
      const res = await setOpenAiModelAction(modelOnly);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Modelo padrão atualizado.");
        router.refresh();
      }
    } finally {
      setSavingModel(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="OpenAI"
        description="A inteligência que o bot usa para responder."
        action={
          <Badge tone={meta.tone}>
            <StatusDot tone={meta.tone === "danger" ? "danger" : meta.tone === "success" ? "success" : "neutral"} /> {meta.label}
          </Badge>
        }
      />
      <div className="space-y-4 p-5">
        {data.usingDevKey ? <InfoBanner>Ambiente de desenvolvimento: usando a chave de desenvolvimento até você configurar a sua.</InfoBanner> : null}
        {noKeyAtAll ? <InfoBanner tone="warning">Sem chave, o bot responde de forma simulada (só para testes).</InfoBanner> : null}

        {data.configured ? (
          <div className="space-y-1.5 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs">
            <div className="truncate font-mono text-foreground">{data.masked}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              {data.checkedAt ? <span>verificado {data.checkedAt}</span> : null}
              <span>modelo: {models.find((m) => m.id === data.model)?.label ?? data.model}</span>
            </div>
            {data.error ? <p className="text-danger">{data.error}</p> : null}
          </div>
        ) : data.error ? (
          <p className="text-xs text-danger">{data.error}</p>
        ) : null}

        {data.configured ? (
          <Field label="Modelo padrão" hint="Trocar aqui não precisa da chave de novo.">
            <div className="flex gap-2">
              <Select value={modelOnly} onChange={(e) => setModelOnly(e.target.value)} className="flex-1">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.hint}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="outline" loading={savingModel} disabled={modelOnly === data.model} onClick={handleSaveModel}>
                Salvar modelo
              </Button>
            </div>
          </Field>
        ) : null}

        <div className="space-y-3 border-t border-border pt-4">
          <Field label="Chave da API">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." />
          </Field>
          <Field label={data.configured ? "Modelo para a nova chave" : "Modelo padrão"}>
            <Select value={modelDraft} onChange={(e) => setModelDraft(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.hint}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-subtle">Com o modelo mini, uma conversa típica custa centavos.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={saving} onClick={handleSave}>
              {saving ? "Salvando e testando…" : "Salvar e testar"}
            </Button>
            {data.configured ? (
              <>
                <Button size="sm" variant="outline" loading={testing} onClick={handleRecheck}>
                  Testar novamente
                </Button>
                <Button size="sm" variant="danger" loading={removing} onClick={handleRemove}>
                  Remover
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <Collapsible title="Onde encontro a chave da OpenAI?">
          <ol className="list-decimal space-y-1 pl-4">
            <li>Crie uma conta em platform.openai.com.</li>
            <li>Em Billing, adicione créditos (US$ 5 já dão para muitas conversas).</li>
            <li>Em API keys, crie uma chave e copie (ela só aparece uma vez).</li>
            <li>Cole aqui.</li>
          </ol>
        </Collapsible>
      </div>
    </Card>
  );
}
