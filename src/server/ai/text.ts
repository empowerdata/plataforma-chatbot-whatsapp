import "server-only";

/**
 * Utilidades de texto para a base de conhecimento: extração de arquivos,
 * limpeza e divisão em trechos (chunks) para embedding.
 */

export const SUPPORTED_FILE_TYPES = ["pdf", "docx", "txt", "md", "csv"] as const;

export async function extractTextFromFile(file: { name: string; buffer: Buffer; mimeType?: string }): Promise<string> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || file.mimeType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return cleanText(String(text ?? ""));
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanText(res.value);
  }
  if (["txt", "md", "csv", "json"].includes(ext) || (file.mimeType ?? "").startsWith("text/")) {
    return cleanText(file.buffer.toString("utf8"));
  }
  throw new Error(`Formato não suportado (${ext || file.mimeType || "desconhecido"}). Envie PDF, DOCX, TXT, MD ou CSV.`);
}

export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Remove tags e scripts de um HTML e devolve texto legível. */
export function htmlToText(html: string): string {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withBreaks = noScripts.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  const text = withBreaks.replace(/<[^>]+>/g, " ");
  return cleanText(
    text
      .replace(/^[ 	]+/gm, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

export type ChunkOptions = { maxChars?: number; overlap?: number };

/**
 * Divide o texto em trechos de ~maxChars caracteres respeitando parágrafos e
 * frases, com sobreposição para não cortar contexto.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 900;
  const overlap = opts.overlap ?? 120;
  const clean = cleanText(text);
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = "";
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // Parágrafo enorme: quebra por frases.
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((current + " " + s).length > maxChars) {
          push();
          current = s.length > maxChars ? s.slice(0, maxChars) : s;
          if (s.length > maxChars) {
            for (let i = maxChars; i < s.length; i += maxChars - overlap) {
              push();
              current = s.slice(i - overlap, i + maxChars - overlap);
            }
          }
        } else {
          current = current ? current + " " + s : s;
        }
      }
      continue;
    }
    if ((current + "\n\n" + para).length > maxChars) {
      const tail = current.slice(-overlap);
      push();
      current = tail && tail.length < overlap + 1 && tail.includes(" ") ? tail.slice(tail.indexOf(" ") + 1) + "\n\n" + para : para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  push();
  return chunks;
}

/** Converte pares P/R em trechos independentes (um por pergunta). */
export function faqToChunks(pairs: { q: string; a: string }[]): string[] {
  return pairs
    .filter((p) => p.q.trim() && p.a.trim())
    .map((p) => `Pergunta: ${p.q.trim()}\nResposta: ${p.a.trim()}`);
}

/** Lê o formato de FAQ salvo em knowledge_items.content ("P: ...\nR: ..." por bloco). */
export function parseFaq(content: string): { q: string; a: string }[] {
  const blocks = content.split(/\n\s*\n/);
  const out: { q: string; a: string }[] = [];
  for (const b of blocks) {
    const m = b.match(/^\s*P:\s*([\s\S]*?)\n\s*R:\s*([\s\S]*)$/);
    if (m) out.push({ q: m[1].trim(), a: m[2].trim() });
  }
  return out;
}

export function serializeFaq(pairs: { q: string; a: string }[]): string {
  return pairs.map((p) => `P: ${p.q.trim()}\nR: ${p.a.trim()}`).join("\n\n");
}

/** Estimativa grosseira de tokens (pt-BR ≈ 3,5 caracteres por token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
