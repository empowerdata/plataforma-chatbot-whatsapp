"use server";

import { redirect } from "next/navigation";
import { consumePasswordToken } from "@/server/services/accounts";
import { createSession } from "@/server/auth/session";

export type SetPasswordState = { error: string | null };

export async function setPasswordAction(_prev: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As senhas não conferem." };
  const result = await consumePasswordToken(token, password);
  if (!result) return { error: "Este link expirou ou já foi usado." };
  await createSession(result.userId);
  redirect("/");
}
