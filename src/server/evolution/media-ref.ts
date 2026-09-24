/**
 * "Endereço" de uma mídia do WhatsApp: a chave da mensagem mais o pedaço dela
 * que tem a chave de criptografia e o caminho do arquivo no servidor do
 * WhatsApp. Com isso o Evolution baixa o arquivo na hora em que alguém abre a
 * conversa — o painel não guarda arquivo nenhum (a cópia oficial fica no
 * celular do próprio número; ver docs/visao-e-decisoes.md).
 *
 * O Evolution que instalamos não guarda mensagens (DATABASE_SAVE_DATA_NEW_MESSAGE
 * =false), então sem este endereço não haveria como buscar a mídia depois.
 * Miniatura embutida e contexto de resposta são descartados: ficam umas
 * centenas de bytes por mensagem.
 */
export type MediaRef = { key: { id: string; remoteJid?: string; fromMe?: boolean }; message: Record<string, unknown> };

const MEDIA_TYPES = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "documentWithCaptionMessage", "ptvMessage"] as const;
const DROP = new Set(["jpegThumbnail", "contextInfo", "streamingSidecar", "thumbnailDirectPath", "thumbnailSha256", "thumbnailEncSha256", "scansSidecar", "midQualityFileSha256"]);

/** Bytes podem chegar como base64 (webhook), Buffer serializado ou Uint8Array serializado (resposta do envio). */
function asBase64(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.type === "Buffer" && Array.isArray(o.data)) return Buffer.from(o.data as number[]).toString("base64");
  const keys = Object.keys(o);
  if (keys.length > 0 && keys.every((k, i) => k === String(i)) && keys.every((k) => typeof o[k] === "number")) {
    return Buffer.from(keys.map((k) => o[k] as number)).toString("base64");
  }
  return null;
}

function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (!v || typeof v !== "object") return v;
  const bytes = asBase64(v);
  if (bytes !== null) return bytes;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!DROP.has(k)) out[k] = clean(val);
  }
  return out;
}

/** Extrai o endereço da mídia de uma mensagem no formato do Evolution (webhook ou resposta de envio). */
export function mediaRefFrom(raw: unknown): MediaRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { key?: { id?: unknown; remoteJid?: unknown; fromMe?: unknown }; message?: Record<string, unknown> };
  const id = r.key?.id;
  if (typeof id !== "string" || !id || !r.message || typeof r.message !== "object") return null;
  const type = MEDIA_TYPES.find((t) => r.message?.[t]);
  if (!type) return null;
  return {
    key: { id, remoteJid: typeof r.key?.remoteJid === "string" ? r.key.remoteJid : undefined, fromMe: r.key?.fromMe === true },
    message: { [type]: clean(r.message[type]) },
  };
}

export function isMediaRef(v: unknown): v is MediaRef {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<MediaRef>;
  return typeof r.key?.id === "string" && !!r.message && typeof r.message === "object";
}
