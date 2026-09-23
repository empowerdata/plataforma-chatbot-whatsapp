"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreVertical, Trash2 } from "lucide-react";
import { Badge, Button, Input, Switch } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { botTemplates, defaultBotConfig, deepMerge, type BotConfig } from "@/shared/bot-config";
import { deleteBotAction, duplicateBotAction, publishBotAction, updateBotAction } from "../actions";
import { IdentidadeTab } from "./studio-tabs/identidade-tab";
import { InstrucoesTab } from "./studio-tabs/instrucoes-tab";
import { NegocioTab } from "./studio-tabs/negocio-tab";
import { ComportamentoTab } from "./studio-tabs/comportamento-tab";
import { AcoesTab } from "./studio-tabs/acoes-tab";
import { ConhecimentoTab, type KnowledgeItemData } from "./studio-tabs/conhecimento-tab";
import { ModeloTab } from "./studio-tabs/modelo-tab";
import { Playground } from "./studio-tabs/playground";

export type StudioBot = {
  id: string;
  name: string;
  config: BotConfig;
  version: number;
  publishedAt: string | null;
  isActive: boolean;
  templateKey: string | null;
};

type TabKey = "identidade" | "instrucoes" | "negocio" | "comportamento" | "acoes" | "conhecimento" | "modelo";

const tabItems: { value: TabKey; label: string }[] = [
  { value: "identidade", label: "Identidade" },
  { value: "instrucoes", label: "Instruções" },
  { value: "negocio", label: "Negócio" },
  { value: "comportamento", label: "Comportamento" },
  { value: "acoes", label: "Ações" },
  { value: "conhecimento", label: "Conhecimento" },
  { value: "modelo", label: "Modelo" },
];

export function StudioClient({
  bot,
  numbersCount,
  knowledge,
  chatModelOptions,
}: {
  bot: StudioBot;
  numbersCount: number;
  knowledge: KnowledgeItemData[];
  chatModelOptions: { id: string; label: string; hint: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog } = useDialogs();

  const [tab, setTab] = React.useState<TabKey>("identidade");
  const [name, setName] = React.useState(bot.name);
  const [config, setConfig] = React.useState<BotConfig>(() => defaultBotConfig(bot.config));
  const [dirty, setDirty] = React.useState(false);
  const [version, setVersion] = React.useState(bot.version);
  const [publishedAt, setPublishedAt] = React.useState<string | null>(bot.publishedAt);
  const [isActive, setIsActive] = React.useState(bot.isActive);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const patch = React.useCallback((p: Record<string, unknown>) => {
    setConfig((c) => deepMerge(c, p));
    setDirty(true);
  }, []);

  function handleNameChange(v: string) {
    setName(v);
    setDirty(true);
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await updateBotAction(bot.id, { name, config });
      if (res.error) {
        toast.error(res.error);
        return false;
      }
      setVersion(res.data!.version);
      setDirty(false);
      toast.success("Alterações salvas.");
      router.refresh();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      if (dirty) {
        const ok = await handleSave();
        if (!ok) return;
      }
      const res = await publishBotAction(bot.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setVersion(res.data!.version);
      setPublishedAt(new Date().toISOString());
      toast.success(`Publicado — v${res.data!.version}.`);
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  async function handleToggleActive(v: boolean) {
    setIsActive(v);
    const res = await updateBotAction(bot.id, { isActive: v });
    if (res.error) {
      toast.error(res.error);
      setIsActive(!v);
      return;
    }
    toast.success(v ? "Bot ativado." : "Bot desativado.");
    router.refresh();
  }

  async function handleDuplicate() {
    setMenuOpen(false);
    const res = await duplicateBotAction(bot.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Bot duplicado.");
    router.push(`/bots/${res.data!.id}`);
  }

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirmDialog(`Excluir "${name}"? Os números que usam este bot ficam sem atendimento automático. Essa ação não pode ser desfeita.`, {
      title: "Excluir bot",
      destructive: true,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const res = await deleteBotAction(bot.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Bot excluído.");
    router.push("/bots");
  }

  const template = botTemplates.find((t) => t.key === bot.templateKey);

  return (
    <div className="animate-fade-in-up">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-xl">{template?.emoji ?? "💬"}</span>
          <Input value={name} onChange={(e) => handleNameChange(e.target.value)} aria-label="Nome do bot" className="h-9 w-64 text-base font-semibold" />
          <Badge tone="neutral">v{version}</Badge>
          <Badge tone={publishedAt ? "success" : "neutral"}>{publishedAt ? "publicado" : "rascunho"}</Badge>
          {!isActive ? <Badge tone="warning">inativo</Badge> : null}
          <span className="text-xs text-muted">
            {numbersCount} número{numbersCount === 1 ? "" : "s"} usando este bot
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={handleSave} loading={saving} disabled={!dirty}>
            Salvar
          </Button>
          <Button onClick={handlePublish} loading={publishing} title="Publica a versão atual para os números que usam este bot">
            Publicar
          </Button>
          <div className="relative">
            <Button variant="outline" size="icon" onClick={() => setMenuOpen((v) => !v)} aria-label="Mais ações">
              <MoreVertical className="h-4 w-4" />
            </Button>
            {menuOpen ? (
              <>
                <button className="fixed inset-0 z-40 cursor-default" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border-strong bg-surface-1 py-1 shadow-xl animate-scale-in">
                  <button onClick={handleDuplicate} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2">
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>Ativo</span>
                    <Switch checked={isActive} onChange={handleToggleActive} />
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <button onClick={handleDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} items={tabItems} />
          <div className="mt-4">
            {tab === "identidade" ? <IdentidadeTab config={config} patch={patch} /> : null}
            {tab === "instrucoes" ? <InstrucoesTab config={config} patch={patch} /> : null}
            {tab === "negocio" ? <NegocioTab config={config} patch={patch} /> : null}
            {tab === "comportamento" ? <ComportamentoTab config={config} patch={patch} /> : null}
            {tab === "acoes" ? <AcoesTab config={config} patch={patch} /> : null}
            {tab === "conhecimento" ? <ConhecimentoTab botId={bot.id} items={knowledge} /> : null}
            {tab === "modelo" ? <ModeloTab config={config} patch={patch} chatModelOptions={chatModelOptions} /> : null}
          </div>
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Playground botId={bot.id} config={config} />
        </div>
      </div>
    </div>
  );
}
