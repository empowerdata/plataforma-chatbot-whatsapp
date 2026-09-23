"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Smartphone, User, Bot, PhoneOff, QrCode, Pause } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Select, Badge, numberStatusMeta, StatusDot, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";

type NumberOpt = { id: string; label: string; status: string; botName: string | null; nodeKind: "http" | "fake" };
type Msg = { id: string; sender: "contact" | "bot" | "human" | "system"; type: string; text: string; at: string };
type Snapshot = { status: string; conversation?: { id: string; status: string; needsHuman: boolean }; contact?: { id: string; pausedUntil: string | null; blocked: boolean }; messages: Msg[] };

export function SimuladorClient({ numbers }: { numbers: NumberOpt[] }) {
  const toast = useToast();
  const router = useRouter();
  const fakeNumbers = numbers.filter((n) => n.nodeKind === "fake");
  const [numberId, setNumberId] = React.useState(fakeNumbers[0]?.id ?? "");
  const [phone, setPhone] = React.useState("5511977770001");
  const [pushName, setPushName] = React.useState("Juliana");
  const [text, setText] = React.useState("");
  const [humanText, setHumanText] = React.useState("");
  const [snap, setSnap] = React.useState<Snapshot | null>(null);
  const [busy, setBusy] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const number = numbers.find((n) => n.id === numberId);

  const load = React.useCallback(async () => {
    if (!numberId || !phone) return;
    const res = await fetch(`/api/dev/simulador?numberId=${numberId}&phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
    if (res.ok) setSnap(await res.json());
  }, [numberId, phone]);

  React.useEffect(() => {
    void load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [snap?.messages.length]);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/dev/simulador", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const sendIncoming = async () => {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await call({ action: "incoming", numberId, fromPhone: phone, text: t, pushName });
  };

  const sendHuman = async () => {
    if (!humanText.trim()) return;
    const t = humanText;
    setHumanText("");
    await call({ action: "human", numberId, toPhone: phone, text: t });
  };

  if (!fakeNumbers.length) {
    return <EmptyState icon={<Smartphone className="h-6 w-6" />} title="Nenhum número na Evolution simulada" description="Crie um número em Números: em desenvolvimento ele nasce no servidor simulado." />;
  }

  const meta = numberStatusMeta(snap?.status ?? number?.status ?? "created");
  const paused = snap?.contact?.pausedUntil && new Date(snap.contact.pausedUntil) > new Date();

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <Field label="Número (instância simulada)">
            <Select value={numberId} onChange={(e) => setNumberId(e.target.value)}>
              {fakeNumbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <StatusDot tone={meta.tone} pulse={meta.pulse} /> {meta.label}
            </span>
            <span className="text-muted">bot: {number?.botName ?? "nenhum"}</span>
          </div>
          <div className="flex gap-2">
            {snap?.status !== "open" ? (
              <Button size="sm" variant="secondary" loading={busy} onClick={() => call({ action: "scan", numberId, phone: "5511988880001", profileName: number?.label })}>
                <QrCode className="h-3.5 w-3.5" /> Simular leitura do QR
              </Button>
            ) : (
              <Button size="sm" variant="outline" loading={busy} onClick={() => call({ action: "disconnect", numberId })}>
                <PhoneOff className="h-3.5 w-3.5" /> Derrubar conexão
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Cliente (quem manda mensagem)</div>
          <Field label="Telefone do cliente">
            <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Nome no WhatsApp">
            <Input value={pushName} onChange={(e) => setPushName(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {["5511977770001|Juliana", "5511977770002|Rafael", "5511977770003|Dona Célia", "5511977770004|Novo cliente"].map((p) => {
              const [ph, nm] = p.split("|");
              return (
                <button key={ph} onClick={() => { setPhone(ph); setPushName(nm); }} className={cn("rounded-full border px-2 py-0.5 text-[11px]", phone === ph ? "border-accent text-accent" : "border-border text-muted hover:text-foreground")}>
                  {nm}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Dono do negócio (responde pelo celular)</div>
          <p className="text-xs text-muted">Quando o dono responde pelo próprio WhatsApp, o bot detecta e fica em silêncio com esse cliente por algumas horas.</p>
          <div className="flex gap-2">
            <Input value={humanText} placeholder="Resposta humana…" onChange={(e) => setHumanText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendHuman()} />
            <Button variant="secondary" onClick={sendHuman} loading={busy} disabled={snap?.status !== "open"}>
              <User className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>

      <Card className="flex min-h-[560px] flex-col">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted" /> +{phone} <span className="text-muted">({pushName})</span>
            </span>
          }
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              {snap?.conversation ? <Badge tone={snap.conversation.needsHuman ? "warning" : snap.conversation.status === "human" ? "info" : "success"}>{snap.conversation.needsHuman ? "precisa de humano" : snap.conversation.status === "human" ? "com humano" : "bot atendendo"}</Badge> : null}
              {paused ? (
                <Badge tone="info">
                  <Pause className="h-3 w-3" /> bot pausado até {formatRelative(snap!.contact!.pausedUntil!).replace("há ", "")}
                </Badge>
              ) : null}
            </span>
          }
        />
        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,rgba(230,237,243,0.04)_1px,transparent_0)] bg-[length:18px_18px] p-4">
          {!snap?.messages.length ? (
            <p className="py-16 text-center text-sm text-muted">Envie uma mensagem como cliente para começar. {snap?.status !== "open" ? "Conecte o número primeiro (botão de QR à esquerda)." : ""}</p>
          ) : (
            snap.messages.map((m) => {
              const mine = m.sender !== "contact";
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm", mine ? "bg-wa-out text-white" : "bg-wa-in text-foreground")}>
                    {m.sender === "human" ? <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">atendente humano</div> : m.sender === "bot" ? <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/70"><Bot className="h-3 w-3" /> bot</div> : null}
                    <div className="whitespace-pre-wrap">{m.text || `[${m.type}]`}</div>
                    <div className={cn("mt-1 text-right text-[10px]", mine ? "text-white/60" : "text-muted")}>{new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="flex gap-2 border-t border-border p-3">
          <Input value={text} placeholder={snap?.status === "open" ? "Mensagem do cliente… (Enter envia)" : "Conecte o número para conversar"} disabled={snap?.status !== "open"} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendIncoming()} />
          <Button onClick={sendIncoming} loading={busy} disabled={snap?.status !== "open"}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
