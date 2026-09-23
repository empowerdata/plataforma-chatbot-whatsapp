/**
 * Ids das mensagens que NÓS enviamos recentemente, por número.
 * A Evolution devolve um `messages.upsert` com fromMe=true para tudo que o
 * número envia (inclusive o que o bot mandou). Sem isto, a resposta do bot
 * poderia ser confundida com "o dono respondeu pelo celular" numa corrida
 * entre o webhook e a gravação no banco.
 */
const MAX_PER_NUMBER = 2000;
const g = globalThis as unknown as { __sentCache?: Map<string, Set<string>> };
const cache = (g.__sentCache ??= new Map());

export function markSent(numberId: string, messageId: string | null | undefined): void {
  if (!messageId) return;
  let set = cache.get(numberId);
  if (!set) {
    set = new Set();
    cache.set(numberId, set);
  }
  set.add(messageId);
  if (set.size > MAX_PER_NUMBER) {
    const first = set.values().next().value;
    if (first) set.delete(first);
  }
}

export function wasSentByUs(numberId: string, messageId: string): boolean {
  return cache.get(numberId)?.has(messageId) ?? false;
}
