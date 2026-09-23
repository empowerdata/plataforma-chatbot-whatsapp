import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/**
 * Criptografia dos segredos dos alunos (chave OpenAI, string de conexão do
 * Supabase, chaves da Evolution). AES-256-GCM com chave derivada do APP_SECRET.
 * Formato armazenado: v1.<iv>.<tag>.<ciphertext> em base64url.
 */
const KEY = crypto.hkdfSync("sha256", env.APP_SECRET, "plataforma-chatbot", "secrets-v1", 32);

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(KEY), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [v, ivB, tagB, dataB] = stored.split(".");
  if (v !== "v1" || !ivB || !tagB || !dataB) throw new Error("Segredo em formato inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(KEY), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}

/** Mostra só o começo e o fim de um segredo, para a UI. */
export function maskSecret(plain: string, keep = 4): string {
  if (plain.length <= keep * 2) return "•".repeat(plain.length);
  return `${plain.slice(0, keep)}${"•".repeat(8)}${plain.slice(-keep)}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
