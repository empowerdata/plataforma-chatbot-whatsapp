import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * O PGlite (Postgres em WebAssembly, só usado em dev) decide se pode escrever
 * pelas permissões que o Node reporta. No Windows, uma pasta com o atributo
 * "somente leitura" — o OneDrive marca pastas assim — aparece como 444, e o
 * Postgres falha ao criar o arquivo de trava ("PGlite failed to initialize
 * properly"), mesmo o Windows permitindo a escrita. Tira o atributo antes de
 * abrir o banco.
 */
export function ensureWritableDir(dir: string): void {
  if (process.platform !== "win32" || !fs.existsSync(dir)) return;
  const fix = (p: string) => {
    try {
      const mode = fs.statSync(p).mode;
      if (!(mode & 0o200)) fs.chmodSync(p, mode | 0o200);
    } catch {}
  };
  const walk = (d: string) => {
    fix(d);
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else fix(p);
    }
  };
  walk(dir);
}
