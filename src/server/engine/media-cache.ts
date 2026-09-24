/**
 * Guarda por alguns minutos a imagem baixada da Evolution no recebimento,
 * para o turno de resposta (que roda depois do debounce) poder "ver" a
 * mensagem que acabou de chegar sem baixar de novo. De propósito NÃO grava
 * no banco do aluno: é só uma ponte de poucos segundos entre receber e
 * responder, então cada imagem é lida uma única vez (`takeImage` já apaga a
 * entrada) — mensagens antigas no histórico voltam a ser só o resumo em
 * texto (`describeInbound`), evitando reanalisar/gastar tokens de novo a
 * cada rodada.
 */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 200;

type CachedImage = { base64: string; mimeType: string; expiresAt: number };

const g = globalThis as unknown as { __imageCache?: Map<string, CachedImage> };
const cache = (g.__imageCache ??= new Map());

export function cacheImage(numberId: string, externalId: string, base64: string, mimeType: string): void {
  const key = `${numberId}:${externalId}`;
  cache.set(key, { base64, mimeType, expiresAt: Date.now() + TTL_MS });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function takeImage(numberId: string, externalId: string | null): { base64: string; mimeType: string } | null {
  if (!externalId) return null;
  const key = `${numberId}:${externalId}`;
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  if (hit.expiresAt < Date.now()) return null;
  return { base64: hit.base64, mimeType: hit.mimeType };
}
