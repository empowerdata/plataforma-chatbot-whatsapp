"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, Plus, Server as ServerIcon } from "lucide-react";
import { Modal, useDialogs } from "@/components/ui/dialog";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, StatusDot, Switch, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import { checkNodeAction, createNodeAction, deleteNodeAction, updateNodeAction } from "./actions";

export type NodeItem = {
  id: string;
  name: string;
  kind: "http" | "fake";
  baseUrl: string;
  capacity: number;
  used: number;
  isActive: boolean;
  lastHealthAt: string | null;
  lastHealthOk: boolean | null;
  lastHealthError: string | null;
  version: string | null;
  notes: string | null;
  createdAt: string;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export function ServidoresClient({ nodes }: { nodes: NodeItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog } = useDialogs();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [checkingId, setCheckingId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const editingNode = nodes.find((n) => n.id === editingId) ?? null;

  async function handleCheck(id: string) {
    setCheckingId(id);
    const res = await checkNodeAction(id);
    setCheckingId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data?.ok) toast.success(`Servidor OK${res.data.version ? ` — versão ${res.data.version}` : ""}.`);
    else toast.error(res.data?.error ?? "O servidor não respondeu.");
    router.refresh();
  }

  async function handleToggleActive(node: NodeItem, next: boolean) {
    setBusyId(node.id);
    const res = await updateNodeAction(node.id, { isActive: next });
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete(node: NodeItem) {
    const ok = await confirmDialog(`Excluir o servidor "${node.name}"? Essa ação não pode ser desfeita.`, { destructive: true, confirmLabel: "Excluir" });
    if (!ok) return;
    setBusyId(node.id);
    const res = await deleteNodeAction(node.id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Servidor excluído.");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Servidores"
        description="Servidores Evolution que hospedam as instâncias de WhatsApp."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Adicionar servidor
          </Button>
        }
      />

      <div className="mb-6 flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>Cada número de WhatsApp vira uma instância em um destes servidores. Novos números vão para o servidor com mais vagas. O servidor simulado só existe em desenvolvimento.</p>
      </div>

      {nodes.length === 0 ? (
        <EmptyState
          icon={<ServerIcon className="h-6 w-6" />}
          title="Nenhum servidor cadastrado"
          description="Adicione um servidor Evolution para poder criar números de WhatsApp."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar servidor
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nodes.map((node) => {
            const pct = node.capacity > 0 ? Math.min(100, Math.round((node.used / node.capacity) * 100)) : 0;
            const barTone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-accent";
            const healthTone: Tone = node.lastHealthOk === true ? "success" : node.lastHealthOk === false ? "danger" : "neutral";
            return (
              <Card key={node.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{node.name}</span>
                      {node.kind === "fake" ? <Badge tone="neutral">simulado</Badge> : null}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{node.baseUrl}</div>
                  </div>
                  <Switch checked={node.isActive} disabled={busyId === node.id} onChange={(v) => handleToggleActive(node, v)} />
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  <StatusDot tone={healthTone} />
                  <span className="text-muted">{node.lastHealthAt ? `verificado ${formatRelative(node.lastHealthAt)}` : "nunca verificado"}</span>
                  {node.version ? <span className="text-subtle" title={formatDateTime(node.lastHealthAt)}>· v{node.version}</span> : null}
                </div>
                {node.lastHealthError ? <p className="mt-1 text-[11px] text-danger">{node.lastHealthError}</p> : null}

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{node.used} usados</span>
                    <span>{node.capacity > 0 ? `${node.capacity} vagas` : "sem limite"}</span>
                  </div>
                  {node.capacity > 0 ? (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className={cn("h-full rounded-full transition-[width]", barTone)} style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                </div>

                {node.notes ? <p className="mt-3 text-xs text-muted">{node.notes}</p> : null}

                <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
                  <Button size="sm" variant="outline" loading={checkingId === node.id} onClick={() => handleCheck(node.id)}>
                    Testar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(node.id)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="danger" className="ml-auto" loading={busyId === node.id} onClick={() => handleDelete(node)}>
                    Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateNodeModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
      <EditNodeModal
        node={editingNode}
        onClose={() => {
          setEditingId(null);
          router.refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Adicionar servidor

function CreateNodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [capacity, setCapacity] = React.useState("40");
  const [notes, setNotes] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [health, setHealth] = React.useState<{ ok: boolean; version?: string; error?: string } | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setBaseUrl("");
      setApiKey("");
      setCapacity("40");
      setNotes("");
      setHealth(null);
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createNodeAction({ name, baseUrl, apiKey, capacity: Number(capacity), notes: notes.trim() ? notes : undefined });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        toast.success("Servidor cadastrado.");
        setHealth(res.data.health);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar servidor"
      description={health ? undefined : "Cadastre um servidor Evolution API real."}
      size="md"
      footer={
        health ? (
          <Button onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={pending}>
              Adicionar
            </Button>
          </>
        )
      }
    >
      {health ? (
        <div className="space-y-2">
          <div className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", health.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            <StatusDot tone={health.ok ? "success" : "danger"} />
            {health.ok ? `Conectado${health.version ? ` — versão ${health.version}` : ""}.` : health.error ?? "Não foi possível conectar."}
          </div>
          <p className="text-xs text-muted">Você pode testar de novo a qualquer momento pelo botão &quot;Testar&quot; no card do servidor.</p>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Nome">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Servidor 1" />
          </Field>
          <Field label="URL base" hint="URL pública da Evolution API, ex.: https://evo.seudominio.com">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://evo.seudominio.com" />
          </Field>
          <Field label="Chave da API" hint="AUTHENTICATION_API_KEY do servidor">
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          <Field label="Capacidade" hint="Quantos números este servidor comporta">
            <Input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <Field label="Notas (opcional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Editar servidor

function EditNodeModal({ node, onClose }: { node: NodeItem | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [capacity, setCapacity] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (node) {
      setName(node.name);
      setBaseUrl(node.baseUrl);
      setApiKey("");
      setCapacity(String(node.capacity));
      setNotes(node.notes ?? "");
    }
  }, [node]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!node) return;
    startTransition(async () => {
      const res = await updateNodeAction(node.id, { name, baseUrl, apiKey: apiKey.trim() ? apiKey : undefined, capacity: Number(capacity), notes });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Servidor atualizado.");
      onClose();
    });
  }

  return (
    <Modal
      open={!!node}
      onClose={onClose}
      title="Editar servidor"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nome">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="URL base">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
        <Field label="Chave da API" hint="Deixe em branco para manter a chave atual.">
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Field>
        <Field label="Capacidade" hint="Quantos números este servidor comporta">
          <Input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label="Notas (opcional)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
