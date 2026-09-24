"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Pencil, PhoneOff, QrCode, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select, StatusDot, Switch, numberStatusMeta } from "@/components/ui/primitives";
import { useDialogs } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/utils";
import type { NumberSettings } from "@/shared/number-settings";
import { assignBotAction, disconnectNumberAction, deleteNumberAction, reconnectNumberAction, updateNumberAction } from "../actions";
import { ConexaoModal } from "../conexao-modal";

export type NumberDetail = {
  id: string;
  label: string;
  status: string;
  phone: string | null;
  profileName: string | null;
  clientId: string | null;
  botId: string | null;
  botEnabled: boolean;
  variables: Record<string, string>;
  settings: NumberSettings;
  nodeName: string;
  nodeKind: "http" | "fake";
  lastError: string | null;
  lastMessage: string | null;
  createdAt: string;
};

type ClientOpt = { id: string; name: string };
type BotOpt = { id: string; name: string };
type EventItem = { id: string; level: string; message: string; when: string };

export function NumeroClient({
  number,
  clients,
  bots,
  botVars,
  events,
}: {
  number: NumberDetail;
  clients: ClientOpt[];
  bots: BotOpt[];
  botVars: string[];
  events: EventItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog, promptDialog } = useDialogs();
  // Número recém-criado (ou ainda no meio da conexão) já nasce em "qr"/"connecting":
  // abre o modal de conexão sozinho para o QR aparecer assim que a pessoa chega na página.
  const [connOpen, setConnOpen] = React.useState(number.status === "qr" || number.status === "connecting");
  const [busy, setBusy] = React.useState(false);

  const meta = numberStatusMeta(number.status);

  async function editLabel() {
    const value = await promptDialog("Nome do número", number.label, { title: "Renomear número", confirmLabel: "Salvar" });
    if (value === null) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === number.label) return;
    const res = await updateNumberAction(number.id, { label: trimmed });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Nome atualizado.");
    router.refresh();
  }

  async function onConectar() {
    setBusy(true);
    try {
      if (number.status === "close") {
        const res = await reconnectNumberAction(number.id);
        if (res.error) {
          toast.error(res.error);
          return;
        }
      }
      setConnOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function onDesconectar() {
    const ok = await confirmDialog(`Desconectar "${number.label}"? O bot para de responder por esse número até reconectar.`, { title: "Desconectar número" });
    if (!ok) return;
    const res = await disconnectNumberAction(number.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Número desconectado.");
    router.refresh();
  }

  async function onExcluir() {
    const ok = await confirmDialog(`Excluir "${number.label}"? Essa ação não pode ser desfeita e a instância é removida do servidor.`, {
      title: "Excluir número",
      destructive: true,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const res = await deleteNumberAction(number.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Número excluído.");
    router.push("/numeros");
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{number.label}</h1>
            <button onClick={editLabel} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Renomear número">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              {formatPhone(number.phone)}
              {number.profileName ? ` · ${number.profileName}` : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              servidor: {number.nodeName}
              {number.nodeKind === "fake" ? <Badge tone="neutral">simulado</Badge> : null}
            </span>
            <span>criado {number.createdAt}</span>
          </div>
          <Link href={`/conversas?numero=${number.id}`} className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Ver conversas deste número <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {number.status !== "open" ? (
            <Button variant="secondary" loading={busy} onClick={onConectar}>
              <QrCode className="h-4 w-4" /> {number.status === "close" ? "Reconectar" : "Conectar"}
            </Button>
          ) : (
            <Button variant="outline" onClick={onDesconectar}>
              <PhoneOff className="h-4 w-4" /> Desconectar
            </Button>
          )}
          <Button variant="danger" onClick={onExcluir}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        </div>
      </div>

      {number.lastError ? (
        <div className="mb-6 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{number.lastError}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <BotCard number={number} bots={bots} />
        <ClienteCard number={number} clients={clients} />
        <VariablesCard numberId={number.id} variables={number.variables} botVars={botVars} />
        <AjustesCard numberId={number.id} settings={number.settings} />
      </div>

      <div className="mt-6">
        <EventosCard events={events} />
      </div>

      {connOpen ? (
        <ConexaoModal
          onClose={() => {
            setConnOpen(false);
            router.refresh();
          }}
          numberId={number.id}
          simulated={number.nodeKind === "fake"}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Bot

function BotCard({ number, bots }: { number: NumberDetail; bots: BotOpt[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  function onSelectBot(e: React.ChangeEvent<HTMLSelectElement>) {
    const botId = e.target.value || null;
    startTransition(async () => {
      const res = await assignBotAction(number.id, botId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(botId ? "Bot atribuído a este número." : "Bot removido deste número.");
      router.refresh();
    });
  }

  function onToggleEnabled(value: boolean) {
    startTransition(async () => {
      const res = await updateNumberAction(number.id, { botEnabled: value });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Bot" description="Quem responde as mensagens deste número." />
      <div className="space-y-3 p-5">
        <Field label="Bot atribuído">
          <Select value={number.botId ?? ""} onChange={onSelectBot} disabled={pending}>
            <option value="">Nenhum</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Switch checked={number.botEnabled} onChange={onToggleEnabled} label="Bot ativo neste número" disabled={pending} />
        {number.botId ? (
          <Link href={`/bots/${number.botId}`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            Editar bot <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Cliente

function ClienteCard({ number, clients }: { number: NumberDetail; clients: ClientOpt[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();

  function onSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const clientId = e.target.value || null;
    startTransition(async () => {
      const res = await updateNumberAction(number.id, { clientId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Cliente atualizado.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Cliente" description="A quem este número pertence." />
      <div className="p-5">
        <Field label="Cliente">
          <Select value={number.clientId ?? ""} onChange={onSelect} disabled={pending}>
            <option value="">Nenhum</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Variáveis

function VariablesCard({ numberId, variables, botVars }: { numberId: string; variables: Record<string, string>; botVars: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = React.useState<{ key: string; value: string }[]>(() => {
    const seen = new Set<string>();
    const initial: { key: string; value: string }[] = [];
    for (const k of botVars) {
      initial.push({ key: k, value: variables[k] ?? "" });
      seen.add(k);
    }
    for (const k of Object.keys(variables)) {
      if (!seen.has(k)) initial.push({ key: k, value: variables[k] });
    }
    return initial;
  });
  const [newKey, setNewKey] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  function addCustom() {
    const key = newKey.trim();
    if (!key) return;
    if (rows.some((r) => r.key === key)) {
      toast.error("Essa variável já existe.");
      return;
    }
    setRows((r) => [...r, { key, value: "" }]);
    setNewKey("");
  }

  function save() {
    startTransition(async () => {
      const obj: Record<string, string> = {};
      for (const r of rows) if (r.key.trim()) obj[r.key.trim()] = r.value;
      const res = await updateNumberAction(numberId, { variables: obj });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Variáveis salvas.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Variáveis" description="Preenchem {{...}} no conteúdo das mensagens do bot." />
      <div className="space-y-2 p-5">
        {rows.map((row, i) => (
          <div key={`${row.key}-${i}`} className="flex items-center gap-2">
            <Input value={row.key} disabled className="w-40 shrink-0 font-mono text-xs" />
            <Input
              value={row.value}
              placeholder="valor"
              onChange={(e) => setRows((r) => r.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)))}
            />
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <Input value={newKey} onChange={(e) => setNewKey(e.target.value.replace(/\s+/g, "_"))} placeholder="nome_da_variavel" className="w-40 shrink-0 font-mono text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={addCustom}>
            Adicionar
          </Button>
        </div>
        <p className="text-xs text-subtle">
          Use {"{{nome_da_variavel}}"} nas instruções do bot. Variáveis padrão: nome_empresa, nome_assistente, horario.
        </p>
        <div className="flex justify-end pt-1">
          <Button size="sm" loading={pending} onClick={save}>
            Salvar variáveis
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Ajustes de atendimento

function AjustesCard({ numberId, settings }: { numberId: string; settings: NumberSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [notifyPhone, setNotifyPhone] = React.useState(settings.notifyPhone ?? "");
  const [pauseHours, setPauseHours] = React.useState(settings.pauseHoursOnHuman !== undefined ? String(settings.pauseHoursOnHuman) : "");
  const [debounceSeconds, setDebounceSeconds] = React.useState(settings.debounceSeconds !== undefined ? String(settings.debounceSeconds) : "");
  const [timeoutHours, setTimeoutHours] = React.useState(settings.conversationTimeoutHours !== undefined ? String(settings.conversationTimeoutHours) : "");
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const patch: NumberSettings = {};
      if (notifyPhone.trim()) patch.notifyPhone = notifyPhone.replace(/\D/g, "");
      if (pauseHours.trim() !== "") patch.pauseHoursOnHuman = Number(pauseHours);
      if (debounceSeconds.trim() !== "") patch.debounceSeconds = Number(debounceSeconds);
      if (timeoutHours.trim() !== "") patch.conversationTimeoutHours = Number(timeoutHours);
      const res = await updateNumberAction(numberId, { settings: patch });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Ajustes salvos.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Ajustes de atendimento" description="Sobrescrevem o comportamento padrão do bot só para este número." />
      <div className="space-y-3 p-5">
        <Field label="Telefone para aviso" hint="Recebe um aviso no WhatsApp quando o bot pedir atendimento humano.">
          <Input value={notifyPhone} onChange={(e) => setNotifyPhone(e.target.value.replace(/\D/g, ""))} placeholder="Só números, com DDD" />
        </Field>
        <Field
          label="Pausa após resposta humana (horas)"
          hint="Horas que o bot fica em silêncio com um cliente depois que alguém da equipe responde pelo celular. Vazio = usar o valor do bot."
        >
          <Input type="number" min={0} max={72} value={pauseHours} onChange={(e) => setPauseHours(e.target.value)} placeholder="Vazio = padrão do bot" />
        </Field>
        <Field label="Espera antes de responder (segundos)" hint="Segundos esperando o cliente terminar de digitar antes de responder.">
          <Input type="number" min={0} max={30} value={debounceSeconds} onChange={(e) => setDebounceSeconds(e.target.value)} placeholder="Vazio = padrão do bot" />
        </Field>
        <Field label="Conversa encerrada após (horas)" hint="Horas de inatividade para considerar a conversa encerrada. Vazio = usar o valor do bot.">
          <Input type="number" min={1} max={168} value={timeoutHours} onChange={(e) => setTimeoutHours(e.target.value)} placeholder="Vazio = padrão do bot" />
        </Field>
        <div className="flex justify-end pt-1">
          <Button size="sm" loading={pending} onClick={save}>
            Salvar ajustes
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Eventos

function EventosCard({ events }: { events: EventItem[] }) {
  return (
    <Card>
      <CardHeader title="Eventos recentes" description="Conexões, avisos e erros deste número." />
      <ul className="divide-y divide-border">
        {events.length === 0 ? (
          <li className="px-5 py-6 text-center text-sm text-muted">Nada por aqui ainda.</li>
        ) : (
          events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
              {e.level === "error" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              ) : e.level === "warn" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : (
                <StatusDot tone="neutral" />
              )}
              <span className="flex-1 text-foreground/90">{e.message}</span>
              <span className="shrink-0 text-[11px] text-muted">{e.when}</span>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}
