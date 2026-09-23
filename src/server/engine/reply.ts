/** Formatação da resposta do modelo em bolhas de WhatsApp. */

/** Converte markdown leve em formatação do WhatsApp e limpa o que não cabe. */
export function toWhatsAppText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/^[ \t]*[-•][ \t]+/gm, "• ")
    .replace(/\[(\d+)\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Divide em bolhas: parágrafos separados por linha em branco viram bolhas;
 * parágrafos maiores que maxChars são quebrados por frase.
 */
export function splitBubbles(text: string, maxChars = 420): string[] {
  const clean = toWhatsAppText(text);
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const bubbles: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= maxChars) {
      bubbles.push(p);
      continue;
    }
    const sentences = p.split(/(?<=[.!?…])\s+/);
    let cur = "";
    for (const s of sentences) {
      if ((cur + " " + s).trim().length > maxChars && cur) {
        bubbles.push(cur.trim());
        cur = s;
      } else {
        cur = cur ? cur + " " + s : s;
      }
      while (cur.length > maxChars) {
        bubbles.push(cur.slice(0, maxChars).trim());
        cur = cur.slice(maxChars);
      }
    }
    if (cur.trim()) bubbles.push(cur.trim());
  }
  // Junta uma bolha muito curta com a seguinte (ex.: "Claro!" + "Segue o cardápio"), sem encadear.
  const merged: string[] = [];
  let lastWasMerged = false;
  for (const b of bubbles) {
    const last = merged[merged.length - 1];
    if (last && !lastWasMerged && last.length < 40 && (last + "\n" + b).length <= maxChars) {
      merged[merged.length - 1] = last + "\n" + b;
      lastWasMerged = true;
    } else {
      merged.push(b);
      lastWasMerged = false;
    }
  }
  return merged.slice(0, 6);
}

/** Tempo "digitando" proporcional ao tamanho (em ms). */
export function typingDelayMs(text: string, opts: { min?: number; max?: number; perChar?: number } = {}): number {
  const min = opts.min ?? 900;
  const max = opts.max ?? 4000;
  const perChar = opts.perChar ?? 35;
  return Math.max(min, Math.min(max, Math.round(text.length * perChar)));
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
