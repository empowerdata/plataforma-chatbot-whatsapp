import "server-only";
import type {
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
import { WEBHOOK_EVENTS } from "./types";

/**
 * Cliente HTTP da Evolution API v2.
 * Os caminhos e formatos seguem a documentação pública; itens marcados com
 * "validar" devem ser conferidos na Fase 0 contra o servidor real.
 */
export class HttpEvolutionClient implements EvolutionClient {
  readonly kind = "http" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(method: string, pathname: string, body?: unknown, apiKey = this.apiKey): Promise<T> {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: { "content-type": "application/json", apikey: apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const detail = typeof data === "object" && data ? JSON.stringify(data).slice(0, 400) : String(data).slice(0, 400);
      throw new Error(`Evolution ${method} ${pathname} → ${res.status}: ${detail}`);
    }
    return data as T;
  }

  async health() {
    try {
      const data = await this.request<{ version?: string; status?: number }>("GET", "/");
      return { ok: true, version: data?.version };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async createInstance(input: CreateInstanceInput): Promise<CreateInstanceResult> {
    const data = await this.request<{
      instance?: { instanceName?: string; instanceId?: string };
      hash?: string | { apikey?: string };
      qrcode?: { pairingCode?: string | null; code?: string; base64?: string; count?: number };
    }>("POST", "/instance/create", {
      instanceName: input.instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      token: input.token,
      number: input.number,
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      webhook: {
        url: input.webhookUrl,
        byEvents: false,
        base64: true,
        events: [...WEBHOOK_EVENTS],
      },
    });
    const token = typeof data.hash === "string" ? data.hash : (data.hash?.apikey ?? input.token ?? "");
    return {
      instanceName: data.instance?.instanceName ?? input.instanceName,
      instanceId: data.instance?.instanceId,
      token,
      qr: data.qrcode ? normalizeQr(data.qrcode) : undefined,
    };
  }

  async connect(instanceName: string, number?: string): Promise<QrInfo> {
    const qs = number ? `?number=${encodeURIComponent(number)}` : "";
    const data = await this.request<{ pairingCode?: string | null; code?: string; base64?: string; count?: number }>(
      "GET",
      `/instance/connect/${encodeURIComponent(instanceName)}${qs}`,
    );
    return normalizeQr(data);
  }

  async getState(instanceName: string): Promise<InstanceInfo> {
    const data = await this.request<{ instance?: { instanceName?: string; state?: string } }>(
      "GET",
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
    const state = data.instance?.state;
    return { instanceName, state: state === "open" || state === "close" || state === "connecting" ? state : "unknown" };
  }

  async listInstances(): Promise<InstanceInfo[]> {
    const data = await this.request<unknown>("GET", "/instance/fetchInstances");
    const arr = Array.isArray(data) ? data : [];
    return arr.map((raw) => {
      const r = raw as Record<string, unknown>;
      const inst = (r.instance as Record<string, unknown> | undefined) ?? r; // v1 aninha em "instance"; v2 é plano
      const state = String(inst.connectionStatus ?? inst.status ?? "unknown");
      return {
        instanceName: String(inst.name ?? inst.instanceName ?? ""),
        state: state === "open" || state === "close" || state === "connecting" ? state : "unknown",
        ownerJid: inst.ownerJid ? String(inst.ownerJid) : undefined,
        profileName: inst.profileName ? String(inst.profileName) : undefined,
        profilePicUrl: inst.profilePicUrl ? String(inst.profilePicUrl) : undefined,
      };
    });
  }

  async setWebhook(instanceName: string, url: string): Promise<void> {
    await this.request("POST", `/webhook/set/${encodeURIComponent(instanceName)}`, {
      webhook: { enabled: true, url, byEvents: false, base64: true, events: [...WEBHOOK_EVENTS] },
    });
  }

  async restart(instanceName: string): Promise<void> {
    await this.request("POST", `/instance/restart/${encodeURIComponent(instanceName)}`);
  }

  async logout(instanceName: string): Promise<void> {
    await this.request("DELETE", `/instance/logout/${encodeURIComponent(instanceName)}`);
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.request("DELETE", `/instance/delete/${encodeURIComponent(instanceName)}`);
  }

  async sendText(instanceName: string, input: SendTextInput): Promise<SendResult> {
    const data = await this.request<{ key?: { id?: string } }>("POST", `/message/sendText/${encodeURIComponent(instanceName)}`, {
      number: input.number,
      text: input.text,
      delay: input.delayMs ?? 0,
      linkPreview: false,
      quoted: input.quotedId ? { key: { id: input.quotedId } } : undefined,
    });
    return { messageId: data.key?.id ?? "", raw: data };
  }

  async sendMedia(instanceName: string, input: SendMediaInput): Promise<SendResult> {
    const data = await this.request<{ key?: { id?: string } }>("POST", `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      number: input.number,
      mediatype: input.mediaType,
      mimetype: input.mimeType,
      caption: input.caption,
      media: input.media,
      fileName: input.fileName,
    });
    return { messageId: data.key?.id ?? "", raw: data };
  }

  async sendLocation(instanceName: string, input: SendLocationInput): Promise<SendResult> {
    const data = await this.request<{ key?: { id?: string } }>("POST", `/message/sendLocation/${encodeURIComponent(instanceName)}`, {
      number: input.number,
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    return { messageId: data.key?.id ?? "", raw: data };
  }

  async sendPresence(instanceName: string, number: string, presence: "composing" | "paused" | "recording", delayMs = 1200): Promise<void> {
    await this.request("POST", `/chat/sendPresence/${encodeURIComponent(instanceName)}`, { number, presence, delay: delayMs });
  }

  async markRead(instanceName: string, remoteJid: string, messageId: string): Promise<void> {
    await this.request("POST", `/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`, {
      readMessages: [{ remoteJid, fromMe: false, id: messageId }],
    });
  }

  async getMedia(instanceName: string, raw: unknown): Promise<{ base64: string; mimeType: string } | null> {
    const data = await this.request<{ base64?: string; mimetype?: string }>(
      "POST",
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
      { message: raw, convertToMp4: false },
    );
    if (!data.base64) return null;
    return { base64: data.base64, mimeType: data.mimetype ?? "application/octet-stream" };
  }
}

function normalizeQr(q: { pairingCode?: string | null; code?: string; base64?: string; count?: number }): QrInfo {
  return {
    base64: q.base64,
    code: q.code,
    pairingCode: q.pairingCode ?? undefined,
    count: q.count,
  };
}
