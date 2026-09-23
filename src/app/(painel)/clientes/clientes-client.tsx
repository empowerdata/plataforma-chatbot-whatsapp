"use client";

import * as React from "react";
import { Building2, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Modal, useDialogs } from "@/components/ui/dialog";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/utils";
import { createClientAction, deleteClientAction, updateClientAction } from "./actions";

type ClienteItem = {
  id: string;
  name: string;
  segment: string | null;
  contactName: string | null;
  contactPhone: string | null;
  city: string | null;
  notes: string | null;
  numbers: number;
  connected: number;
  createdAt: string;
};

const SEGMENT_SUGGESTIONS = ["Pizzaria / delivery", "Restaurante", "Salão / barbearia", "Clínica / consultório", "Loja / comércio", "Imobiliária", "Serviços", "Outro"];

export function ClientesClient({ clients }: { clients: ClienteItem[] }) {
  const toast = useToast();
  const { confirmDialog } = useDialogs();
  const [editing, setEditing] = React.useState<ClienteItem | null | undefined>(undefined);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function onDelete(client: ClienteItem) {
    const ok = await confirmDialog(`Excluir "${client.name}"?\n\nOs números deste cliente continuam existindo, só perdem o vínculo.`, {
      title: "Excluir cliente",
      destructive: true,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    setBusyId(client.id);
    try {
      const res = await deleteClientAction(client.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Cliente excluído.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="O negócio que você atende — por exemplo uma pizzaria. Cada cliente pode ter um ou mais números."
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> Adicionar cliente
          </Button>
        }
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="Nenhum cliente ainda"
          description="O cliente é o negócio que você atende, por exemplo uma pizzaria. Cada cliente pode ter um ou mais números."
          action={
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" /> Adicionar cliente
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                  {c.segment ? <Badge tone="neutral" className="mt-1">{c.segment}</Badge> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setEditing(c)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={`Editar ${c.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(c)}
                    disabled={busyId === c.id}
                    className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    aria-label={`Excluir ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-muted">
                {c.contactName || c.contactPhone ? (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {c.contactName ?? "—"}
                      {c.contactPhone ? ` · ${formatPhone(c.contactPhone)}` : ""}
                    </span>
                  </div>
                ) : null}
                {c.city ? (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.city}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted">
                <span>
                  {c.numbers} número{c.numbers === 1 ? "" : "s"}, {c.connected} conectado{c.connected === 1 ? "" : "s"}
                </span>
                <span>{c.createdAt}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ClienteModal open={editing !== undefined} client={editing ?? null} onClose={() => setEditing(undefined)} />
    </div>
  );
}

function ClienteModal({ open, client, onClose }: { open: boolean; client: ClienteItem | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [segment, setSegment] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [city, setCity] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setName(client?.name ?? "");
    setSegment(client?.segment ?? "");
    setContactName(client?.contactName ?? "");
    setContactPhone(client?.contactPhone ?? "");
    setCity(client?.city ?? "");
    setNotes(client?.notes ?? "");
  }, [open, client]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload = {
        name,
        segment: segment || undefined,
        contactName: contactName || undefined,
        contactPhone: contactPhone || undefined,
        city: city || undefined,
        notes: notes || undefined,
      };
      const res = client ? await updateClientAction(client.id, payload) : await createClientAction(payload);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(client ? "Cliente atualizado." : "Cliente criado.");
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? "Editar cliente" : "Adicionar cliente"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            {client ? "Salvar" : "Criar cliente"}
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nome do cliente">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pizzaria do João" />
        </Field>
        <Field label="Segmento">
          <Input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="Ex.: Pizzaria / delivery" list="segmentos-sugeridos" />
          <datalist id="segmentos-sugeridos">
            {SEGMENT_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Nome do contato">
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Quem você fala no dia a dia" />
        </Field>
        <Field label="Telefone do contato">
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value.replace(/\D/g, ""))} placeholder="Só números, com DDD" />
        </Field>
        <Field label="Cidade">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações internas sobre este cliente" />
        </Field>
      </form>
    </Modal>
  );
}
