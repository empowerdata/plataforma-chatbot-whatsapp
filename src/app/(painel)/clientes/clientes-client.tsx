"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Modal, useDialogs } from "@/components/ui/dialog";
import { Badge, Button, Card, CopyBox, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/utils";
import { createClientAction, deleteClientAction, grantPortalAccessAction, newPortalSetupLinkAction, setPortalAccessActiveAction, updateClientAction } from "./actions";

type PortalUser = { id: string; name: string; email: string; isActive: boolean };

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
  portalUser: PortalUser | null;
};

const SEGMENT_SUGGESTIONS = ["Pizzaria / delivery", "Restaurante", "Salão / barbearia", "Clínica / consultório", "Loja / comércio", "Imobiliária", "Serviços", "Outro"];

export function ClientesClient({ clients }: { clients: ClienteItem[] }) {
  const toast = useToast();
  const { confirmDialog } = useDialogs();
  const [editing, setEditing] = React.useState<ClienteItem | null | undefined>(undefined);
  // Guarda só o id: o cliente vem sempre da lista atual, que o router.refresh() renova depois de cada ação no portal.
  const [portalForId, setPortalForId] = React.useState<string | null>(null);
  const portalFor = clients.find((c) => c.id === portalForId) ?? null;
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

              <button
                type="button"
                onClick={() => setPortalForId(c.id)}
                className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
              >
                <KeyRound className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate text-left">
                  {c.portalUser ? (c.portalUser.isActive ? `Portal ativo · ${c.portalUser.email}` : `Portal desativado · ${c.portalUser.email}`) : "Cliente ainda sem acesso ao portal"}
                </span>
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Montados só enquanto abertos (e por cliente, via key): cada abertura começa com o formulário no estado certo. */}
      {editing !== undefined ? <ClienteModal key={editing?.id ?? "novo"} client={editing} onClose={() => setEditing(undefined)} /> : null}
      {portalFor ? <PortalAccessModal key={portalFor.id} client={portalFor} onClose={() => setPortalForId(null)} /> : null}
    </div>
  );
}

/** `client` nulo = cadastro novo. */
function ClienteModal({ client, onClose }: { client: ClienteItem | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState(client?.name ?? "");
  const [segment, setSegment] = React.useState(client?.segment ?? "");
  const [contactName, setContactName] = React.useState(client?.contactName ?? "");
  const [contactPhone, setContactPhone] = React.useState(client?.contactPhone ?? "");
  const [city, setCity] = React.useState(client?.city ?? "");
  const [notes, setNotes] = React.useState(client?.notes ?? "");
  const [pending, startTransition] = React.useTransition();

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
      open
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

function PortalAccessModal({ client, onClose }: { client: ClienteItem; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const portalUser = client.portalUser;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await grantPortalAccessAction(client.id, { name, email });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setLink(res.data?.setupLink ?? null);
      toast.success("Acesso criado.");
      router.refresh();
    });
  };

  const toggleActive = () => {
    if (!portalUser) return;
    startTransition(async () => {
      const res = await setPortalAccessActiveAction(portalUser.id, !portalUser.isActive);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(portalUser.isActive ? "Portal desativado." : "Portal reativado.");
      router.refresh();
    });
  };

  const regenerate = () => {
    if (!portalUser) return;
    startTransition(async () => {
      const res = await newPortalSetupLinkAction(portalUser.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setLink(res.data?.setupLink ?? null);
    });
  };

  return (
    <Modal open onClose={onClose} title={`Portal de ${client.name}`} footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Um acesso próprio e restrito: {client.name} vê só as conversas e o desempenho dele, nunca os outros clientes da sua conta.
        </p>

        {!portalUser ? (
          <form className="space-y-3" onSubmit={create}>
            <Field label="Nome de quem vai acessar">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: nome do responsável" />
            </Field>
            <Field label="E-mail de acesso">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@cliente.com" />
            </Field>
            <Button type="submit" loading={pending} className="w-full justify-center">
              Criar acesso ao portal
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{portalUser.name}</div>
                <div className="truncate text-xs text-muted">{portalUser.email}</div>
              </div>
              <Badge tone={portalUser.isActive ? "success" : "neutral"}>{portalUser.isActive ? "ativo" : "desativado"}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" loading={pending} onClick={regenerate}>
                Gerar novo link de acesso
              </Button>
              <Button variant={portalUser.isActive ? "danger" : "secondary"} size="sm" className="flex-1" loading={pending} onClick={toggleActive}>
                {portalUser.isActive ? "Desativar" : "Reativar"}
              </Button>
            </div>
          </div>
        )}

        {link ? <CopyBox label="Link para o cliente definir a senha (envie por WhatsApp ou e-mail)" value={link} /> : null}
      </div>
    </Modal>
  );
}
