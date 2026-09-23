/**
 * Debounce por contato: cada nova mensagem reinicia o timer; quando o timer
 * dispara, roda o processamento. Se chegar mensagem durante o processamento,
 * agenda uma nova rodada ao final (nunca roda duas vezes em paralelo para o
 * mesmo contato). Em memória: sobrevive ao HMR via globalThis.
 *
 * Em produção com várias réplicas, trocar por fila com Redis (BullMQ) mantendo
 * esta mesma interface.
 */
export interface Scheduler {
  schedule(key: string, delayMs: number, run: () => Promise<void>): void;
  cancel(key: string): void;
  pendingCount(): number;
}

type Entry = { timer: NodeJS.Timeout | null; running: boolean; rerun: boolean; run: () => Promise<void>; delayMs: number };

export class MemoryScheduler implements Scheduler {
  private entries = new Map<string, Entry>();

  schedule(key: string, delayMs: number, run: () => Promise<void>): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.run = run;
      existing.delayMs = delayMs;
      if (existing.running) {
        existing.rerun = true;
        return;
      }
      if (existing.timer) clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.fire(key), delayMs);
      return;
    }
    const entry: Entry = { timer: null, running: false, rerun: false, run, delayMs };
    entry.timer = setTimeout(() => this.fire(key), delayMs);
    this.entries.set(key, entry);
  }

  cancel(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    if (e.timer) clearTimeout(e.timer);
    if (!e.running) this.entries.delete(key);
    else e.rerun = false;
  }

  pendingCount(): number {
    return this.entries.size;
  }

  private async fire(key: string): Promise<void> {
    const e = this.entries.get(key);
    if (!e) return;
    e.timer = null;
    e.running = true;
    try {
      await e.run();
    } catch (err) {
      console.error(`[scheduler] erro ao processar ${key}`, err);
    } finally {
      e.running = false;
      if (e.rerun) {
        e.rerun = false;
        e.timer = setTimeout(() => this.fire(key), Math.min(e.delayMs, 1500));
      } else {
        this.entries.delete(key);
      }
    }
  }
}

const g = globalThis as unknown as { __scheduler?: Scheduler };
export function getScheduler(): Scheduler {
  return (g.__scheduler ??= new MemoryScheduler());
}
