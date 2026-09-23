"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAccountOrThrow } from "@/server/auth/guards";
import { updateAccount } from "@/server/services/accounts";

type Result = { error: string | null };

function fail(err: unknown): Result {
  return { error: err instanceof Error ? err.message : String(err) };
}

const brandingSchema = z.object({
  productName: z.string().trim().max(60, "Use no máximo 60 caracteres."),
});

/** Atualiza a marca do painel da conta atual (o id vem do guard, nunca do cliente). */
export async function updateBrandingAction(input: { productName: string }): Promise<Result> {
  try {
    const { account } = await getAccountOrThrow();
    const parsed = brandingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const productName = parsed.data.productName;
    // Em branco = volta ao nome padrão do painel.
    await updateAccount(account.id, { branding: { ...account.branding, productName: productName || undefined } });
    revalidatePath("/configuracoes");
    revalidatePath("/", "layout"); // o nome aparece no menu lateral
    return { error: null };
  } catch (err) {
    return fail(err);
  }
}
