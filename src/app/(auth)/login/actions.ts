"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ensureReady, schema } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const db = await ensureReady();
  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "E-mail ou senha incorretos." };
  }
  if (!user.isActive) return { error: "Este acesso está desativado. Fale com o administrador." };
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession(user.id);
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  if (user.role === "client") redirect(next === "/" ? "/portal/conversas" : next);
  // Super admin sem conta própria (instalação multi-conta hospedada) escolhe a conta em
  // Admin → Contas; com conta própria (instalação de conta única) cai direto no painel dela.
  redirect(user.role === "super_admin" && !user.accountId && next === "/" ? "/admin/contas" : next);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
