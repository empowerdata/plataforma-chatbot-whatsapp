import type { ConnectionState, InboundMessage, QrInfo, WebhookEvent } from "./types";

/**
 * Converte o payload bruto do webhook da Evolution num evento tipado.
 * Tolerante a variações entre versões (v1/v2): tudo que não reconhece vira "ignored".
 */
export function parseWebhook(body: unknown): WebhookEvent {
  const b = (body ?? {}) as Record<string, unknown>;
  const instance = String(b.instance ?? "");
  const event = String(b.event ?? "").toLowerCase().replace(/_/g, ".");
  const data = (b.data ?? {}) as Record<string, unknown>;

  switch (event) {
    case "messages.upsert": {
      const msg = parseMessage(data);
      if (!msg) return { type: "ignored", instance, event };
      return { type: "messages.upsert", instance, message: msg };
    }
    case "connection.update": {
      const stateRaw = String(data.state ?? data.status ?? "");
      const state: ConnectionState = stateRaw === "open" ? "open" : stateRaw === "connecting" ? "connecting" : "close";
      return { type: "connection.update", instance, state, statusReason: typeof data.statusReason === "number" ? data.statusReason : undefined };
    }
    case "qrcode.updated": {
      const q = (data.qrcode ?? data) as Record<string, unknown>;
      const qr: QrInfo = {
        base64: typeof q.base64 === "string" ? q.base64 : undefined,
        code: typeof q.code === "string" ? q.code : undefined,
        pairingCode: typeof q.pairingCode === "string" ? q.pairingCode : undefined,
        count: typeof q.count === "number" ? q.count : undefined,
      };
      return { type: "qrcode.updated", instance, qr };
    }
    case "logout.instance":
      return { type: "logout", instance };
    case "remove.instance":
      return { type: "remove", instance };
    default:
      return { type: "ignored", instance, event };
  }
}

export function jidToPhone(jid: string): string {
  return jid.split("@")[0].split(":")[0];
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

/** Extrai texto/tipo do objeto "message" do Baileys. */
export function parseMessage(data: Record<string, unknown>): InboundMessage | null {
  const key = (data.key ?? {}) as Record<string, unknown>;
  const remoteJid = String(key.remoteJid ?? "");
  const id = String(key.id ?? "");
  if (!remoteJid || !id) return null;
  if (remoteJid === "status@broadcast") return null;
  const fromMe = Boolean(key.fromMe);
  const message = (data.message ?? {}) as Record<string, unknown>;
  const ts = Number(data.messageTimestamp ?? Math.floor(Date.now() / 1000));

  const base = {
    externalId: id,
    remoteJid,
    phone: jidToPhone(remoteJid),
    fromMe,
    isGroup: isGroupJid(remoteJid),
    pushName: typeof data.pushName === "string" ? data.pushName : undefined,
    timestamp: ts,
    raw: data,
  };

  const conversation = message.conversation;
  const extended = (message.extendedTextMessage as Record<string, unknown> | undefined)?.text;
  if (typeof conversation === "string" && conversation.trim()) return { ...base, type: "text", text: conversation };
  if (typeof extended === "string" && extended.trim()) return { ...base, type: "text", text: extended };

  const img = message.imageMessage as Record<string, unknown> | undefined;
  if (img) return { ...base, type: "image", caption: typeof img.caption === "string" ? img.caption : undefined, mimeType: String(img.mimetype ?? "image/jpeg") };

  const audio = message.audioMessage as Record<string, unknown> | undefined;
  if (audio) return { ...base, type: "audio", mimeType: String(audio.mimetype ?? "audio/ogg") };

  const doc = message.documentMessage as Record<string, unknown> | undefined;
  if (doc) return { ...base, type: "document", caption: typeof doc.caption === "string" ? doc.caption : undefined, mimeType: String(doc.mimetype ?? "application/octet-stream"), text: typeof doc.fileName === "string" ? doc.fileName : undefined };

  if (message.stickerMessage) return { ...base, type: "sticker" };

  const loc = (message.locationMessage ?? message.liveLocationMessage) as Record<string, unknown> | undefined;
  if (loc) {
    return {
      ...base,
      type: "location",
      location: {
        latitude: Number(loc.degreesLatitude ?? 0),
        longitude: Number(loc.degreesLongitude ?? 0),
        name: typeof loc.name === "string" ? loc.name : undefined,
        address: typeof loc.address === "string" ? loc.address : undefined,
      },
    };
  }

  // Mensagens de protocolo, reações, enquetes etc.
  if (message.protocolMessage || message.reactionMessage || message.senderKeyDistributionMessage) return null;
  return { ...base, type: "other" };
}

/** Só para testes e simulador: monta um payload no formato da Evolution. */
export function buildTextUpsertPayload(input: { instance: string; remoteJid: string; id: string; text: string; fromMe?: boolean; pushName?: string }) {
  return {
    event: "messages.upsert",
    instance: input.instance,
    data: {
      key: { remoteJid: input.remoteJid, fromMe: input.fromMe ?? false, id: input.id },
      pushName: input.pushName ?? "Cliente",
      message: { conversation: input.text },
      messageType: "conversation",
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}
