"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { addFaqItemAction, addFileItemAction, addTextItemAction, addUrlItemAction } from "../../actions";

type AddKind = "text" | "faq" | "file" | "url";

export function AddKnowledgeModal({ botId, kind, onClose, onCreated }: { botId: string; kind: AddKind; onClose: () => void; onCreated: () => void }) {
  if (kind === "text") return <AddTextModal botId={botId} onClose={onClose} onCreated={onCreated} />;
  if (kind === "faq") return <AddFaqModal botId={botId} onClose={onClose} onCreated={onCreated} />;
  if (kind === "file") return <AddFileModal botId={botId} onClose={onClose} onCreated={onCreated} />;
  return <AddUrlModal botId={botId} onClose={onClose} onCreated={onCreated} />;
}

type ModalProps = { botId: string; onClose: () => void; onCreated: () => void };

function AddTextModal({ botId, onClose, onCreated }: ModalProps) {
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    if (!content.trim()) {
      toast.error("Escreva o texto.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await addTextItemAction(botId, { title: title.trim() || "Texto", content });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Item adicionado.");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar texto"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={submitting}>
            Adicionar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Cardápio" />
        </Field>
        <Field label="Conteúdo">
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[220px]" />
        </Field>
      </div>
    </Modal>
  );
}

function AddFaqModal({ botId, onClose, onCreated }: ModalProps) {
  const toast = useToast();
  const [title, setTitle] = React.useState("Perguntas frequentes");
  const [pairs, setPairs] = React.useState<{ q: string; a: string }[]>([{ q: "", a: "" }]);
  const [submitting, setSubmitting] = React.useState(false);

  function update(i: number, field: "q" | "a", value: string) {
    setPairs((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }
  function add() {
    setPairs((p) => [...p, { q: "", a: "" }]);
  }
  function remove(i: number) {
    setPairs((p) => p.filter((_, idx) => idx !== i));
  }

  async function submit() {
    const filled = pairs.filter((p) => p.q.trim() && p.a.trim());
    if (!filled.length) {
      toast.error("Adicione pelo menos uma pergunta com resposta.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await addFaqItemAction(botId, { title: title.trim() || "Perguntas frequentes", pairs: filled });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Item adicionado.");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Perguntas e respostas"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={submitting}>
            Adicionar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <div key={i} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted">#{i + 1}</span>
                {pairs.length > 1 ? (
                  <button type="button" onClick={() => remove(i)} className="text-muted hover:text-danger" aria-label="Remover">
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                <Input value={p.q} onChange={(e) => update(i, "q", e.target.value)} placeholder="Pergunta" />
                <Textarea value={p.a} onChange={(e) => update(i, "a", e.target.value)} placeholder="Resposta" className="min-h-[70px]" />
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Pergunta
        </Button>
      </div>
    </Modal>
  );
}

function AddFileModal({ botId, onClose, onCreated }: ModalProps) {
  const toast = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    if (!file) {
      toast.error("Escolha um arquivo.");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("botId", botId);
      formData.set("file", file);
      const res = await addFileItemAction(formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Arquivo adicionado.");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar arquivo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={submitting}>
            Adicionar
          </Button>
        </>
      }
    >
      <Field label="Arquivo" hint="PDF, DOCX, TXT, MD ou CSV, até 1 MB. O texto é extraído e dividido em trechos.">
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-surface-3"
        />
      </Field>
    </Modal>
  );
}

function AddUrlModal({ botId, onClose, onCreated }: ModalProps) {
  const toast = useToast();
  const [url, setUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    if (!/^https?:\/\//i.test(url.trim())) {
      toast.error("Informe um link começando com http:// ou https://.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await addUrlItemAction(botId, { url: url.trim() });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Link adicionado.");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar link"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={submitting}>
            Adicionar
          </Button>
        </>
      }
    >
      <Field label="URL" hint="A página precisa ter texto visível (sem exigir JavaScript para carregar o conteúdo).">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </Field>
    </Modal>
  );
}
