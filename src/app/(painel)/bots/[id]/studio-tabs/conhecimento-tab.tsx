"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, HelpCircle, Link2, Plus, Upload, X } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal, useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatNumber, formatRelative } from "@/lib/utils";
import { deleteItemAction, reindexItemAction, updateItemAction } from "../../actions";
import { AddKnowledgeModal } from "./knowledge-add-modals";

export type KnowledgeItemData = {
  id: string;
  kind: "text" | "faq" | "file" | "url";
  title: string;
  status: "pending" | "indexing" | "ready" | "error";
  error: string | null;
  chunkCount: number;
  charCount: number;
  createdAt: string;
  content: string;
  pairs: { q: string; a: string }[] | null;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const kindLabel: Record<KnowledgeItemData["kind"], string> = { text: "Texto", faq: "Perguntas e respostas", file: "Arquivo", url: "Link" };

function statusBadges(item: KnowledgeItemData): { tone: Tone; label: string }[] {
  const semEmbeddings = item.error?.toLowerCase().includes("sem embeddings") ?? false;
  const badges: { tone: Tone; label: string }[] = [];
  if (item.status === "pending") badges.push({ tone: "neutral", label: "na fila" });
  else if (item.status === "indexing") badges.push({ tone: "info", label: "indexando" });
  else if (item.status === "ready") {
    badges.push({ tone: "success", label: `pronto (${item.chunkCount} trecho${item.chunkCount === 1 ? "" : "s"})` });
    if (semEmbeddings) badges.push({ tone: "info", label: "busca por palavras (sem chave OpenAI)" });
  } else if (item.status === "error") {
    badges.push(semEmbeddings ? { tone: "info", label: "busca por palavras (sem chave OpenAI)" } : { tone: "danger", label: item.error || "Erro ao indexar." });
  }
  return badges;
}

export function ConhecimentoTab({ botId, items }: { botId: string; items: KnowledgeItemData[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog } = useDialogs();
  const [addKind, setAddKind] = React.useState<"text" | "faq" | "file" | "url" | null>(null);
  const [editing, setEditing] = React.useState<KnowledgeItemData | null>(null);
  const [reindexingId, setReindexingId] = React.useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleReindex(id: string) {
    setReindexingId(id);
    try {
      const res = await reindexItemAction(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Reindexação concluída.");
      refresh();
    } finally {
      setReindexingId(null);
    }
  }

  async function handleDelete(item: KnowledgeItemData) {
    const ok = await confirmDialog(`Excluir "${item.title}"? Essa ação não pode ser desfeita.`, { destructive: true, confirmLabel: "Excluir" });
    if (!ok) return;
    const res = await deleteItemAction(item.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Item removido.");
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {items.length} {items.length === 1 ? "item" : "itens"} na base de conhecimento
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAddKind("text")}>
            <FileText className="h-3.5 w-3.5" /> Texto
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAddKind("faq")}>
            <HelpCircle className="h-3.5 w-3.5" /> Perguntas e respostas
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAddKind("file")}>
            <Upload className="h-3.5 w-3.5" /> Arquivo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAddKind("url")}>
            <Link2 className="h-3.5 w-3.5" /> Link
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Base de conhecimento vazia"
          description="Adicione textos, perguntas e respostas, arquivos ou links para o bot responder com informações do negócio."
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-surface-1">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Badge tone="neutral">{kindLabel[item.kind]}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {statusBadges(item).map((b, i) => (
                    <Badge key={i} tone={b.tone}>
                      {b.label}
                    </Badge>
                  ))}
                  <span>{formatNumber(item.charCount)} caracteres</span>
                  <span>{formatRelative(item.createdAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>
                  editar
                </Button>
                <Button size="sm" variant="ghost" loading={reindexingId === item.id} onClick={() => handleReindex(item.id)}>
                  reindexar
                </Button>
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => handleDelete(item)}>
                  excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addKind ? (
        <AddKnowledgeModal
          botId={botId}
          kind={addKind}
          onClose={() => setAddKind(null)}
          onCreated={() => {
            setAddKind(null);
            refresh();
          }}
        />
      ) : null}

      {editing ? (
        <EditItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function EditItemModal({ item, onClose, onSaved }: { item: KnowledgeItemData; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = React.useState(item.title);
  const [content, setContent] = React.useState(item.content);
  const [pairs, setPairs] = React.useState<{ q: string; a: string }[]>(item.pairs?.length ? item.pairs : [{ q: "", a: "" }]);
  const [submitting, setSubmitting] = React.useState(false);

  function updatePair(i: number, field: "q" | "a", value: string) {
    setPairs((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }
  function addPair() {
    setPairs((p) => [...p, { q: "", a: "" }]);
  }
  function removePair(i: number) {
    setPairs((p) => p.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setSubmitting(true);
    try {
      if (item.kind === "faq") {
        const filled = pairs.filter((p) => p.q.trim() && p.a.trim());
        if (!filled.length) {
          toast.error("Adicione pelo menos uma pergunta com resposta.");
          return;
        }
        const res = await updateItemAction(item.id, { title, pairs: filled });
        if (res.error) {
          toast.error(res.error);
          return;
        }
      } else {
        if (!content.trim()) {
          toast.error("O conteúdo não pode ficar vazio.");
          return;
        }
        const res = await updateItemAction(item.id, { title, content });
        if (res.error) {
          toast.error(res.error);
          return;
        }
      }
      toast.success("Item atualizado.");
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar item"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={submitting}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {item.kind === "faq" ? (
          <div className="space-y-3">
            {pairs.map((p, i) => (
              <div key={i} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted">#{i + 1}</span>
                  {pairs.length > 1 ? (
                    <button type="button" onClick={() => removePair(i)} className="text-muted hover:text-danger" aria-label="Remover">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Input value={p.q} onChange={(e) => updatePair(i, "q", e.target.value)} placeholder="Pergunta" />
                  <Textarea value={p.a} onChange={(e) => updatePair(i, "a", e.target.value)} placeholder="Resposta" className="min-h-[70px]" />
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addPair}>
              <Plus className="h-3.5 w-3.5" /> Pergunta
            </Button>
          </div>
        ) : (
          <Field label="Conteúdo">
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[220px]" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
