"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot as BotIcon, Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { botTemplates } from "@/shared/bot-config";
import { createBotAction } from "./actions";

export type BotCardData = {
  id: string;
  name: string;
  templateKey: string | null;
  businessName: string;
  version: number;
  publishedAt: string | null;
  isActive: boolean;
  numbers: number;
  knowledge: number;
};

export function BotsClient({ bots }: { bots: BotCardData[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Bots"
        description="Configure o atendimento automático que os números de WhatsApp usam."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Novo bot
          </Button>
        }
      />

      {bots.length === 0 ? (
        <EmptyState
          icon={<BotIcon className="h-6 w-6" />}
          title="Nenhum bot ainda"
          description="Crie o primeiro bot para começar a atender pelo WhatsApp."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> Novo bot
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.map((b) => {
            const template = botTemplates.find((t) => t.key === b.templateKey);
            return (
              <Link key={b.id} href={`/bots/${b.id}`} className="block">
                <Card className="h-full p-4 transition-colors hover:border-border-strong hover:bg-surface-2">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">{template?.emoji ?? "💬"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{b.name}</div>
                      <div className="truncate text-xs text-muted">{b.businessName || "Sem nome de negócio"}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    {b.numbers} número{b.numbers === 1 ? "" : "s"} · {b.knowledge} {b.knowledge === 1 ? "item" : "itens"} de conhecimento
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">v{b.version}</Badge>
                    <Badge tone={b.publishedAt ? "success" : "neutral"}>{b.publishedAt ? "publicado" : "rascunho"}</Badge>
                    {!b.isActive ? <Badge tone="warning">inativo</Badge> : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <NewBotModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={(id) => router.push(`/bots/${id}`)} />
    </div>
  );
}

function NewBotModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [templateKey, setTemplateKey] = React.useState<string>("generico");
  const [businessName, setBusinessName] = React.useState("");
  const [name, setName] = React.useState("");
  const [nameTouched, setNameTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setTemplateKey("generico");
      setBusinessName("");
      setName("");
      setNameTouched(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!nameTouched) setName(businessName.trim() ? `Atendente da ${businessName.trim()}` : "");
  }, [businessName, nameTouched]);

  async function submit() {
    if (submitting) return;
    if (!businessName.trim()) {
      toast.error("Informe o nome do negócio.");
      return;
    }
    if (name.trim().length < 2) {
      toast.error("Dê um nome ao bot (pelo menos 2 letras).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createBotAction({ name, templateKey, businessName });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onClose();
      onCreated(res.data!.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo bot"
      description="Escolha um modelo de partida e dê um nome ao bot."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={submitting}>
            Criar bot
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted">Modelo de partida</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {botTemplates.map((t) => (
              <button
                type="button"
                key={t.key}
                onClick={() => setTemplateKey(t.key)}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                  templateKey === t.key ? "border-accent bg-accent-soft/40" : "border-border hover:bg-surface-2",
                )}
              >
                <span className="text-lg leading-none">{t.emoji}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{t.name}</div>
                  <div className="text-xs text-muted">{t.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <Field label="Nome do negócio">
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex.: Pizzaria do João" autoFocus />
        </Field>
        <Field label="Nome do bot" hint="Como o bot aparece para vocês no painel.">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="Ex.: Atendente da Pizzaria do João"
          />
        </Field>
      </form>
    </Modal>
  );
}
