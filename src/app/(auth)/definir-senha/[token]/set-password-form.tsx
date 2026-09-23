"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { setPasswordAction, type SetPasswordState } from "./actions";

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPasswordAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="E-mail">
        <Input value={email} disabled />
      </Field>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" required autoFocus minLength={8} />
      </Field>
      <Field label="Confirmar senha">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {state.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p> : null}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Salvar e entrar
      </Button>
    </form>
  );
}
