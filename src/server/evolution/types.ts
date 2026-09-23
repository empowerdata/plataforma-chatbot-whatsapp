/**
 * Tipos da Evolution API v2 (subconjunto que usamos).
 * Referência: https://doc.evolution-api.com — validar na Fase 0 com o servidor real.
 */

export type ConnectionState = "open" | "close" | "connecting";

export type CreateInstanceInput = {
  instanceName: string;
  /** Telefone (E.164 sem +) para gerar código de pareamento em vez de QR. */
  number?: string;
  webhookUrl: string;
  /** Token (apikey) da instância; se omitido a Evolution gera um. */
  token?: string;
};

export type CreateInstanceResult = {
  instanceName: string;
  instanceId?: string;
  /** apikey da instância. */
  token: string;
  qr?: QrInfo;
};

export type QrInfo = {
  /** data URL (image/png;base64,...) ou vazio. */
  base64?: string;
  /** Conteúdo bruto do QR. */
  code?: string;
  pairingCode?: string;
  count?: number;
};

export type InstanceInfo = {
  instanceName: string;
  state: ConnectionState | "unknown";
  ownerJid?: string;
  profileName?: string;
  profilePicUrl?: string;
};

export type SendTextInput = { number: string; text: string; delayMs?: number; quotedId?: string };
export type SendMediaInput = {
  number: string;
  mediaType: "image" | "document" | "video" | "audio";
  /** URL pública ou base64. */
  media: string;
  mimeType?: string;
  caption?: string;
  fileName?: string;
};
export type SendLocationInput = { number: string; name: string; address: string; latitude: number; longitude: number };

export type SendResult = { messageId: string; raw?: unknown };

/** Mensagem recebida já normalizada (independente do formato do webhook). */
export type InboundMessage = {
  externalId: string;
  remoteJid: string;
  /** Telefone sem sufixo @s.whatsapp.net. */
  phone: string;
  fromMe: boolean;
  isGroup: boolean;
  pushName?: string;
  type: "text" | "audio" | "image" | "document" | "sticker" | "location" | "other";
  text?: string;
  caption?: string;
  mimeType?: string;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  timestamp: number;
  /** Payload original (para baixar mídia depois). */
  raw: unknown;
};

export type WebhookEvent =
  | { type: "messages.upsert"; instance: string; message: InboundMessage }
  | { type: "connection.update"; instance: string; state: ConnectionState; statusReason?: number }
  | { type: "qrcode.updated"; instance: string; qr: QrInfo }
  | { type: "logout" | "remove"; instance: string }
  | { type: "ignored"; instance: string; event: string };

export const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "LOGOUT_INSTANCE",
  "REMOVE_INSTANCE",
] as const;

/** Interface única usada pelo restante do sistema (HTTP real ou simulada). */
export interface EvolutionClient {
  readonly kind: "http" | "fake";
  health(): Promise<{ ok: boolean; version?: string; error?: string }>;
  createInstance(input: CreateInstanceInput): Promise<CreateInstanceResult>;
  connect(instanceName: string, number?: string): Promise<QrInfo>;
  getState(instanceName: string): Promise<InstanceInfo>;
  listInstances(): Promise<InstanceInfo[]>;
  setWebhook(instanceName: string, url: string): Promise<void>;
  restart(instanceName: string): Promise<void>;
  logout(instanceName: string): Promise<void>;
  deleteInstance(instanceName: string): Promise<void>;
  sendText(instanceName: string, input: SendTextInput): Promise<SendResult>;
  sendMedia(instanceName: string, input: SendMediaInput): Promise<SendResult>;
  sendLocation(instanceName: string, input: SendLocationInput): Promise<SendResult>;
  sendPresence(instanceName: string, number: string, presence: "composing" | "paused" | "recording", delayMs?: number): Promise<void>;
  markRead(instanceName: string, remoteJid: string, messageId: string): Promise<void>;
  /** Baixa a mídia de uma mensagem recebida (base64 + mime). */
  getMedia(instanceName: string, raw: unknown): Promise<{ base64: string; mimeType: string } | null>;
}
