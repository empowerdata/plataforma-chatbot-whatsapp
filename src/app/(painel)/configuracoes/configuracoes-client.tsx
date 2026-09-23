"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Palette, ShieldCheck, Users } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { updateBrandingAction } from "./actions";

type AccountInfo = {
  name: string;
  slug: string;
  status: "active" | "suspended";
  includedNumbers: number;
  maxNumbers: number;
  expiresAt: string | null;
  createdAt: string;
  productName: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isYou: boolean;
  lastLogin: string | null;
};

export function ConfiguracoesClient({ account, users }: { account: AccountInfo; users: UserRow[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AccountCard account={account} />
      <BrandingCard productName={account.productName} />
      <UsersCard users={users} />
      <SecurityCard />
    </div>
  );
}

function AccountCard({ account }: { account: AccountInfo }) {
  return (
    <Card>
      <CardHeader
        title="Sua conta"
        description="Dados do seu plano na plataforma."
        action={<Badge tone={account.status === "active" ? "success" : "danger"}>{account.status === "active" ? "Ativa" : "Suspensa"}</Badge>}
      />
      <div className="space-y-3 p-5 text-sm">
        <div>
          <div className="text-xs text-subtle">Nome</div>
          <div className="text-foreground">{account.name}</div>
        </div>
        <div>
          <div className="text-xs text-subtle">Identificador</div>
          <div className="font-mono text-xs text-muted">{account.slug}</div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-xs text-muted">
          <span>{account.includedNumbers} números incluídos</span>
          <span>limite: {account.maxNumbers || "sem limite"}</span>
          {account.expiresAt ? <span>expira em {account.expiresAt}</span> : null}
          <span>criada em {account.createdAt}</span>
        </div>
      </div>
    </Card>
  );
}

function BrandingCard({ productName }: { productName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = React.useState(productName);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateBrandingAction({ productName: value.trim() });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Marca atualizada.");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Marca (white label)" description="Como o painel aparece para você e sua equipe." action={<Palette className="h-4 w-4 text-subtle" />} />
      <div className="space-y-3 p-5">
        <Field label="Nome do produto no painel" hint="Aparece no topo do menu para você e sua equipe.">
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: Atendimento Inteligente" />
        </Field>
        <Button size="sm" loading={saving} disabled={value.trim() === productName} onClick={handleSave}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}

function UsersCard({ users }: { users: UserRow[] }) {
  return (
    <Card>
      <CardHeader title="Usuários" description="Quem tem acesso a este painel." action={<Users className="h-4 w-4 text-subtle" />} />
      <div className="divide-y divide-border">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate text-foreground">
                {u.name} {u.isYou ? <span className="text-xs text-muted">(você)</span> : null}
              </div>
              <div className="truncate text-xs text-muted">{u.email}</div>
            </div>
            <Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "ativo" : "inativo"}</Badge>
            <span className="w-20 shrink-0 text-right text-[11px] text-muted">{u.lastLogin ?? "nunca"}</span>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-subtle">Para adicionar ou remover usuários, fale com o administrador da plataforma.</p>
    </Card>
  );
}

function SecurityCard() {
  return (
    <Card>
      <CardHeader title="Segurança" description="Como protegemos seus dados." action={<ShieldCheck className="h-4 w-4 text-subtle" />} />
      <div className="p-5 text-sm text-muted">
        A string de conexão do Supabase e a chave da OpenAI ficam guardadas criptografadas no nosso banco de dados e nunca chegam ao navegador — nem para você, nem para sua equipe.
      </div>
    </Card>
  );
}
