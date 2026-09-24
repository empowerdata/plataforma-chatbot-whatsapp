"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Smartphone, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, StatusDot, numberStatusMeta } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/utils";
import { createNumberAction } from "./actions";

type NumeroListItem = {
  id: string;
  label: string;
  status: string;
  phone: string | null;
  clientName: string | null;
  botName: string | null;
  nodeKind: "http" | "fake";
  lastError: string | null;
  lastMessage: string | null;
};

type ClientOpt = { id: string; name: string };

export function NumerosClient({ numbers, clients, hasBots }: { numbers: NumeroListItem[]; clients: ClientOpt[]; hasBots: boolean }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <PageHeader
        title="Números"
        description="Cada número é uma instância do WhatsApp conectada a um cliente e, opcionalmente, a um bot."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Adicionar número
          </Button>
        }
      />

      {!hasBots ? (
        <p className="mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Você ainda não tem bots. Crie um em <Link href="/bots" className="text-accent hover:underline">Bots</Link> para poder atribuí-lo a um número.
        </p>
      ) : null}

      {numbers.length === 0 ? (
        <EmptyState
          icon={<Smartphone className="h-6 w-6" />}
          title="Nenhum número ainda"
          description="Adicione o WhatsApp do seu primeiro cliente para começar a atender com o bot."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar número
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {numbers.map((n) => {
            const meta = numberStatusMeta(n.status);
            return (
              <Link key={n.id} href={`/numeros/${n.id}`} className="block h-full">
                <Card className="h-full p-4 transition-colors hover:border-border-strong hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5">
                      <StatusDot tone={meta.tone} pulse={meta.pulse} />
                      <span className="text-xs text-muted">{meta.label}</span>
                    </div>
                    {n.nodeKind === "fake" ? <Badge tone="neutral">simulado</Badge> : null}
                  </div>

                  <div className="mt-2 truncate text-sm font-semibold text-foreground">{n.label}</div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {n.clientName ?? <span className="text-warning">sem cliente, escolha um</span>} · {n.botName ?? "sem bot"}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                    <span>{formatPhone(n.phone)}</span>
                    <span>{n.lastMessage ?? "sem mensagens"}</span>
                  </div>

                  {n.lastError ? (
                    <div className="mt-3 flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-[11px] text-danger">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="line-clamp-2">{n.lastError}</span>
                    </div>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Montado só enquanto aberto: cada abertura começa do zero. */}
      {open ? <NovoNumeroModal onClose={() => setOpen(false)} clients={clients} /> : null}
    </div>
  );
}

function NovoNumeroModal({ onClose, clients }: { onClose: () => void; clients: ClientOpt[] }) {
  const router = useRouter();
  const toast = useToast();
  const [label, setLabel] = React.useState("");
  // Com um cliente só, já vem escolhido.
  const [clientId, setClientId] = React.useState(clients.length === 1 ? clients[0].id : "");
  const [pairingPhone, setPairingPhone] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      toast.error("Escolha o cliente deste número.");
      return;
    }
    startTransition(async () => {
      const res = await createNumberAction({ label, clientId, pairingPhone: pairingPhone || undefined });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Número criado. Agora é só conectar.");
      onClose();
      if (res.data) router.push(`/numeros/${res.data.id}`);
    });
  }

  // Todo número pertence a um cliente: sem cliente cadastrado, o primeiro passo é cadastrar.
  if (!clients.length) {
    return (
      <Modal open onClose={onClose} title="Adicionar número" footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => router.push("/clientes")}>Cadastrar cliente</Button>
        </>
      }>
        <p className="text-sm text-foreground">Cadastre o cliente antes do número.</p>
        <p className="mt-1.5 text-sm text-muted">Cada número de WhatsApp pertence a um cliente (o negócio que você atende). É por ele que o cliente vê as próprias conversas e indicadores, sem misturar com os de outro.</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Adicionar número" description="Crie a instância do WhatsApp para um cliente." footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} loading={pending}>Criar número</Button>
      </>
    }>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Cliente" hint="O negócio dono deste WhatsApp. Um número atende um cliente só.">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="" disabled>
              Escolha o cliente
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome do número">
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Pizzaria do João — atendimento" />
        </Field>
        <Field label="Telefone para pareamento (opcional)" hint="Opcional. Se informar o número do celular do cliente, mostramos um código para digitar no WhatsApp em vez de ler o QR.">
          <Input value={pairingPhone} onChange={(e) => setPairingPhone(e.target.value.replace(/\D/g, ""))} placeholder="Só números, com DDD" />
        </Field>
      </form>
    </Modal>
  );
}
