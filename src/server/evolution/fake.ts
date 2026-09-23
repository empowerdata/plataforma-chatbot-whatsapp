import "server-only";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { env } from "../env";
import { randomToken } from "../crypto";
import { buildTextUpsertPayload } from "./webhook-parser";
import type {
  ConnectionState,
  CreateInstanceInput,
  CreateInstanceResult,
  EvolutionClient,
  InstanceInfo,
  QrInfo,
  SendLocationInput,
  SendMediaInput,
  SendResult,
  SendTextInput,
} from "./types";

/**
 * Evolution simulada, para desenvolver e testar sem servidor nem chip.
 * Comporta-se como a real: cria instâncias, devolve QR, dispara webhooks
 * (connection.update, messages.upsert) para a URL configurada e registra
 * tudo que "enviou". A página /dev/simulador usa os métodos simulate*.
 */

export type FakeOutMessage = {
  id: string;
  to: string;
  kind: "text" | "media" | "location" | "presence";
  text?: string;
  at: number;
};

export type FakeInstance = {
  instanceName: string;
  token: string;
  webhookUrl: string;
  state: ConnectionState;
  qrBase64?: string;
  qrCode?: string;
  pairingCode?: string;
  ownerPhone?: string;
  profileName?: string;
  outbox: FakeOutMessage[];
  createdAt: number;
};

type Deliver = (url: string, payload: unknown) => Promise<void>;

const defaultDeliver: Deliver = async (url, payload) => {
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch (err) {
    console.error("[fake-evolution] falha ao entregar webhook", url, err);
  }
};

export class FakeEvolutionClient implements EvolutionClient {
  readonly kind = "fake" as const;
  readonly instances = new Map<string, FakeInstance>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly deliver: Deliver = defaultDeliver,
    private readonly file: string | null = path.join(env.DATA_DIR, "fake-evolution.json"),
  ) {
    this.load();
  }

  // ------------------------------------------------------------ persistência

  private load() {
    if (!this.file) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as FakeInstance[];
      for (const i of raw) this.instances.set(i.instanceName, i);
    } catch {}
  }

  private save() {
    if (!this.file) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file!), { recursive: true });
        fs.writeFileSync(this.file!, JSON.stringify([...this.instances.values()], null, 1));
      } catch (err) {
        console.error("[fake-evolution] falha ao salvar", err);
      }
    }, 150);
  }

  private get(instanceName: string): FakeInstance {
    const i = this.instances.get(instanceName);
    if (!i) throw new Error(`Evolution simulada: instância "${instanceName}" não existe.`);
    return i;
  }

  private async makeQr(inst: FakeInstance) {
    inst.qrCode = `fake-qr:${inst.instanceName}:${randomToken(8)}`;
    inst.qrBase64 = await QRCode.toDataURL(inst.qrCode, { margin: 1, width: 280 });
  }

  private qrInfo(inst: FakeInstance): QrInfo {
    return { base64: inst.qrBase64, code: inst.qrCode, pairingCode: inst.pairingCode, count: 1 };
  }

  // ---------------------------------------------------------- EvolutionClient

  async health() {
    return { ok: true, version: "fake-2.x" };
  }

  async createInstance(input: CreateInstanceInput): Promise<CreateInstanceResult> {
    const inst: FakeInstance = {
      instanceName: input.instanceName,
      token: input.token ?? randomToken(16),
      webhookUrl: input.webhookUrl,
      state: "connecting",
      outbox: [],
      createdAt: Date.now(),
      pairingCode: input.number ? fakePairingCode() : undefined,
    };
    await this.makeQr(inst);
    this.instances.set(inst.instanceName, inst);
    this.save();
    return { instanceName: inst.instanceName, instanceId: `fake-${inst.instanceName}`, token: inst.token, qr: this.qrInfo(inst) };
  }

  async connect(instanceName: string, number?: string): Promise<QrInfo> {
    const inst = this.get(instanceName);
    if (inst.state === "open") return { count: 0 };
    inst.state = "connecting";
    if (number) inst.pairingCode = fakePairingCode();
    await this.makeQr(inst);
    this.save();
    return this.qrInfo(inst);
  }

  async getState(instanceName: string): Promise<InstanceInfo> {
    const inst = this.instances.get(instanceName);
    if (!inst) return { instanceName, state: "unknown" };
    return { instanceName, state: inst.state, ownerJid: inst.ownerPhone ? `${inst.ownerPhone}@s.whatsapp.net` : undefined, profileName: inst.profileName };
  }

  async listInstances(): Promise<InstanceInfo[]> {
    return [...this.instances.values()].map((i) => ({
      instanceName: i.instanceName,
      state: i.state,
      ownerJid: i.ownerPhone ? `${i.ownerPhone}@s.whatsapp.net` : undefined,
      profileName: i.profileName,
    }));
  }

  async setWebhook(instanceName: string, url: string): Promise<void> {
    this.get(instanceName).webhookUrl = url;
    this.save();
  }

  async restart(instanceName: string): Promise<void> {
    const inst = this.get(instanceName);
    if (inst.state === "open") return;
    inst.state = "connecting";
    await this.makeQr(inst);
    this.save();
  }

  async logout(instanceName: string): Promise<void> {
    const inst = this.get(instanceName);
    inst.state = "close";
    inst.ownerPhone = undefined;
    this.save();
    await this.deliver(inst.webhookUrl, { event: "connection.update", instance: instanceName, data: { state: "close", statusReason: 401 } });
  }

  async deleteInstance(instanceName: string): Promise<void> {
    this.instances.delete(instanceName);
    this.save();
  }

  private record(inst: FakeInstance, m: FakeOutMessage) {
    inst.outbox.push(m);
    if (inst.outbox.length > 300) inst.outbox.splice(0, inst.outbox.length - 300);
    this.save();
  }

  async sendText(instanceName: string, input: SendTextInput): Promise<SendResult> {
    const inst = this.get(instanceName);
    if (inst.state !== "open") throw new Error("Evolution simulada: instância não está conectada.");
    const id = `FAKE${randomToken(10).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16)}`;
    this.record(inst, { id, to: input.number, kind: "text", text: input.text, at: Date.now() });
    // A Evolution real também dispara messages.upsert (fromMe=true) para o que enviamos,
    // com a latência da rede: simulamos um pequeno atraso.
    setTimeout(() => {
      void this.deliver(
        inst.webhookUrl,
        buildTextUpsertPayload({ instance: instanceName, remoteJid: `${input.number}@s.whatsapp.net`, id, text: input.text, fromMe: true }),
      );
    }, 40);
    return { messageId: id };
  }

  async sendMedia(instanceName: string, input: SendMediaInput): Promise<SendResult> {
    const inst = this.get(instanceName);
    const id = `FAKEM${randomToken(8).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14)}`;
    this.record(inst, { id, to: input.number, kind: "media", text: `[${input.mediaType}] ${input.caption ?? ""} ${input.media.slice(0, 80)}`, at: Date.now() });
    return { messageId: id };
  }

  async sendLocation(instanceName: string, input: SendLocationInput): Promise<SendResult> {
    const inst = this.get(instanceName);
    const id = `FAKEL${randomToken(8).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14)}`;
    this.record(inst, { id, to: input.number, kind: "location", text: `[localização] ${input.name} — ${input.address}`, at: Date.now() });
    return { messageId: id };
  }

  async sendPresence(instanceName: string, number: string, presence: "composing" | "paused" | "recording"): Promise<void> {
    const inst = this.get(instanceName);
    this.record(inst, { id: "", to: number, kind: "presence", text: presence, at: Date.now() });
  }

  async markRead(): Promise<void> {}

  async getMedia(): Promise<{ base64: string; mimeType: string } | null> {
    return null;
  }

  // ---------------------------------------------------------------- simulação

  /** O dono "escaneou o QR": a instância abre e o webhook avisa. */
  async simulateScan(instanceName: string, ownerPhone: string, profileName = "Negócio de teste"): Promise<void> {
    const inst = this.get(instanceName);
    inst.state = "open";
    inst.ownerPhone = ownerPhone.replace(/\D/g, "");
    inst.profileName = profileName;
    inst.qrBase64 = undefined;
    inst.qrCode = undefined;
    inst.pairingCode = undefined;
    this.save();
    await this.deliver(inst.webhookUrl, {
      event: "connection.update",
      instance: instanceName,
      data: { state: "open", wuid: `${inst.ownerPhone}@s.whatsapp.net`, profileName },
    });
  }

  async simulateDisconnect(instanceName: string): Promise<void> {
    const inst = this.get(instanceName);
    inst.state = "close";
    this.save();
    await this.deliver(inst.webhookUrl, { event: "connection.update", instance: instanceName, data: { state: "close", statusReason: 428 } });
  }

  /** Um cliente mandou mensagem para o número. */
  async simulateIncoming(instanceName: string, input: { fromPhone: string; text: string; pushName?: string }): Promise<string> {
    const inst = this.get(instanceName);
    const id = `IN${randomToken(10).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16)}`;
    const phone = input.fromPhone.replace(/\D/g, "");
    await this.deliver(
      inst.webhookUrl,
      buildTextUpsertPayload({ instance: instanceName, remoteJid: `${phone}@s.whatsapp.net`, id, text: input.text, pushName: input.pushName ?? "Cliente" }),
    );
    return id;
  }

  /** O dono respondeu pelo celular (fromMe, id que não é nosso). */
  async simulateHumanReply(instanceName: string, input: { toPhone: string; text: string }): Promise<string> {
    const inst = this.get(instanceName);
    const id = `HUM${randomToken(10).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16)}`;
    const phone = input.toPhone.replace(/\D/g, "");
    this.record(inst, { id, to: phone, kind: "text", text: input.text, at: Date.now() });
    await this.deliver(
      inst.webhookUrl,
      buildTextUpsertPayload({ instance: instanceName, remoteJid: `${phone}@s.whatsapp.net`, id, text: input.text, fromMe: true }),
    );
    return id;
  }

  outbox(instanceName: string, to?: string): FakeOutMessage[] {
    const inst = this.instances.get(instanceName);
    if (!inst) return [];
    const digits = to?.replace(/\D/g, "");
    return inst.outbox.filter((m) => !digits || m.to.replace(/\D/g, "") === digits);
  }
}

function fakePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => chars[Math.floor(Math.random() * chars.length)];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

const g = globalThis as unknown as { __fakeEvolution?: FakeEvolutionClient };

/** Instância única da Evolution simulada (sobrevive ao HMR). */
export function getFakeEvolution(): FakeEvolutionClient {
  return (g.__fakeEvolution ??= new FakeEvolutionClient());
}
