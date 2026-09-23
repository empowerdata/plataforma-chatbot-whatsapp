"use client";

import { useActionState } from "react";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next, demo }: { next?: string; demo: { admin: string; adminPassword: string } | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { error: null });
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="E-mail">
          <Input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required autoFocus />
        </Field>
        <Field label="Senha">
          <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
        </Field>
        {state.error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{state.error}</p> : null}
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Entrar
        </Button>
      </form>
      {demo ? (
        <div className="mt-5 rounded-md border border-dashed border-border-strong bg-surface-2 p-3 text-xs text-muted">
          <div className="mb-1 font-medium text-foreground">Ambiente de desenvolvimento</div>
          <div>
            Administrador: <span className="font-mono text-foreground">{demo.admin}</span> / <span className="font-mono text-foreground">{demo.adminPassword}</span>
          </div>
          <div>
            Aluno demo: <span className="font-mono text-foreground">demo@local.test</span> / <span className="font-mono text-foreground">demo123</span>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
