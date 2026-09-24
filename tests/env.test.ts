import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";

/**
 * `next build` roda com NODE_ENV=production (o próprio Next força isso, não
 * depende do Dockerfile) mas, no build multi-estágio (infra/Dockerfile), sem
 * os segredos de runtime — eles só existem no container em produção, nunca
 * dentro da imagem, de propósito. Sem o gate por NEXT_PHASE, `env.ts` lança
 * ao ser importado durante a coleta de dados de página do build, derrubando
 * `next build`/`docker build` inteiro (bug real, achado testando a
 * instalação de verdade num VPS em 2026-09-24).
 */
describe("env: fase de build do Next não exige segredos de runtime", () => {
  it("não lança durante `next build` (NEXT_PHASE=phase-production-build), mesmo sem APP_SECRET/DATABASE_URL", async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__env;
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.APP_SECRET;
    delete process.env.DATABASE_URL;
    process.env.DATA_DIR = path.join(os.tmpdir(), "pc-env-build-" + process.pid);

    const { env } = await import("@/server/env");
    expect(env.isProd).toBe(true);
    expect(env.APP_SECRET).toBeTruthy(); // gerado sozinho (loadSecret), não precisa vir do ambiente
  });

  it("continua exigindo APP_SECRET em produção de verdade (sem NEXT_PHASE de build)", async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__env;
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    delete process.env.APP_SECRET;
    process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
    process.env.DATA_DIR = path.join(os.tmpdir(), "pc-env-prod-" + process.pid);

    await expect(import("@/server/env")).rejects.toThrow(/APP_SECRET/);
  });
});
