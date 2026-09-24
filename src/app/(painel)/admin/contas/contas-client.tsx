"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, Pencil, Plus, UserPlus, Users as UsersIcon } from "lucide-react";
import { Modal, useDialogs } from "@/components/ui/dialog";
import { Badge, Button, CopyBox, EmptyState, Field, Input, PageHeader, Select, Spinner, StatusDot, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatRelative } from "@/lib/utils";
import {
  actAsAccountAction,
  createAccountAction,
  createUserAction,
  listAccountUsersAction,
  newSetupLinkAction,
  setUserActiveAction,
  updateAccountAction,
  type AccountUserItem,
} from "./actions";

export type AccountItem = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  includedNumbers: number;
  maxNumbers: number;
  notes: string | null;
  productName: string;
  expiresAt: string | null;
  createdAt: string;
  numbers: number;
  bots: number;
  users: number;
  supabaseStatus: string;
  openaiStatus: string;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

function integrationTone(status: string): Tone {
  if (status === "ok") return "success";
  if (status === "error") return "danger";
  return "neutral";
}

function integrationLabel(status: string): string {
  if (status === "ok") return "conectado";
  if (status === "error") return "com erro";
  return "não configurado";
}

export function ContasClient({ accounts }: { accounts: AccountItem[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [usersId, setUsersId] = React.useState<string | null>(null);

  const editingAccount = accounts.find((a) => a.id === editingId) ?? null;
  const usersAccount = accounts.find((a) => a.id === usersId) ?? null;

  return (
    <div>
      <PageHeader
        title="Contas"
        description="Contas dos alunos na plataforma."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nova conta
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="Nenhuma conta ainda"
          description="Crie a primeira conta para liberar o acesso de um aluno."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Nova conta
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-surface-1">
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{a.name}</span>
                  <Badge tone={a.status === "active" ? "success" : "danger"}>{a.status === "active" ? "ativa" : "suspensa"}</Badge>
                </div>
                <div className="text-xs text-subtle">{a.slug}</div>
              </div>

              <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                <span>
                  {a.numbers} número{a.numbers === 1 ? "" : "s"}
                </span>
                <span>
                  {a.bots} bot{a.bots === 1 ? "" : "s"}
                </span>
                <span>
                  {a.users} usuário{a.users === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span title={`Supabase: ${integrationLabel(a.supabaseStatus)}`} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <StatusDot tone={integrationTone(a.supabaseStatus)} /> Supabase
                </span>
                <span title={`OpenAI: ${integrationLabel(a.openaiStatus)}`} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <StatusDot tone={integrationTone(a.openaiStatus)} /> OpenAI
                </span>
              </div>

              <div className="shrink-0 text-right text-[11px] text-muted">
                <div title={formatDateTime(a.createdAt)}>criada {formatRelative(a.createdAt)}</div>
                {a.expiresAt ? (
                  <div className="text-warning" title={formatDateTime(a.expiresAt)}>
                    expira {formatRelative(a.expiresAt)}
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <form action={actAsAccountAction.bind(null, a.id)}>
                  <Button type="submit" size="sm" variant="outline">
                    <LogIn className="h-3.5 w-3.5" /> Entrar como
                  </Button>
                </form>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(a.id)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setUsersId(a.id)}>
                  <UsersIcon className="h-3.5 w-3.5" /> Usuários
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Montados só enquanto abertos (e por conta, via key): cada abertura começa com o formulário no estado certo. */}
      {createOpen ? (
        <CreateAccountModal
          onClose={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {editingAccount ? (
        <EditAccountModal
          key={editingAccount.id}
          account={editingAccount}
          onClose={() => {
            setEditingId(null);
            router.refresh();
          }}
        />
      ) : null}
      {usersAccount ? <UsersModal key={usersAccount.id} account={usersAccount} onClose={() => setUsersId(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Nova conta

function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [includedNumbers, setIncludedNumbers] = React.useState("3");
  const [maxNumbers, setMaxNumbers] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<{ setupLink: string; email: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createAccountAction({
        name,
        adminName,
        adminEmail,
        includedNumbers: Number(includedNumbers),
        maxNumbers: Number(maxNumbers),
        notes: notes.trim() ? notes : undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        toast.success("Conta criada.");
        setResult({ setupLink: res.data.setupLink, email: adminEmail });
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova conta"
      description={result ? undefined : "Crie a conta do aluno e o acesso do responsável."}
      size="md"
      footer={
        result ? (
          <Button onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={pending}>
              Criar conta
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">Conta criada. Envie o link abaixo para o responsável definir a senha.</p>
          <CopyBox label="Link para definir senha" value={result.setupLink} />
          <p className="text-xs text-muted">Envie este link para o aluno criar a senha. Vale por 7 dias.</p>
          <p className="text-xs text-muted">
            E-mail cadastrado: <span className="text-foreground">{result.email}</span>
          </p>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Nome da conta ou agência">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pizzaria do João" />
          </Field>
          <Field label="Nome do responsável">
            <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          </Field>
          <Field label="E-mail do responsável">
            <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Números incluídos">
              <Input type="number" min={0} value={includedNumbers} onChange={(e) => setIncludedNumbers(e.target.value)} />
            </Field>
            <Field label="Limite máximo" hint="0 = sem limite">
              <Input type="number" min={0} value={maxNumbers} onChange={(e) => setMaxNumbers(e.target.value)} />
            </Field>
          </div>
          <Field label="Notas internas (opcional)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Editar conta

function EditAccountModal({ account, onClose }: { account: AccountItem; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState(account.name);
  const [status, setStatus] = React.useState<"active" | "suspended">(account.status);
  const [includedNumbers, setIncludedNumbers] = React.useState(String(account.includedNumbers));
  const [maxNumbers, setMaxNumbers] = React.useState(String(account.maxNumbers));
  const [notes, setNotes] = React.useState(account.notes ?? "");
  const [productName, setProductName] = React.useState(account.productName);
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateAccountAction({
        id: account.id,
        name,
        status,
        includedNumbers: Number(includedNumbers),
        maxNumbers: Number(maxNumbers),
        notes,
        productName,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Conta atualizada.");
      onClose();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar conta"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nome da conta">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as "active" | "suspended")}>
            <option value="active">Ativa</option>
            <option value="suspended">Suspensa</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Números incluídos">
            <Input type="number" min={0} value={includedNumbers} onChange={(e) => setIncludedNumbers(e.target.value)} />
          </Field>
          <Field label="Limite máximo" hint="0 = sem limite">
            <Input type="number" min={0} value={maxNumbers} onChange={(e) => setMaxNumbers(e.target.value)} />
          </Field>
        </div>
        <Field label="Nome do produto (branding)" hint='Aparece no lugar de "Atendimento" para essa conta.'>
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ex.: Atendimento Pizzaria" />
        </Field>
        <Field label="Notas internas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Usuários

function UsersModal({ account, onClose }: { account: AccountItem; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { confirmDialog } = useDialogs();
  const [users, setUsers] = React.useState<AccountUserItem[] | null>(null);
  const [links, setLinks] = React.useState<Record<string, string>>({});
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newLink, setNewLink] = React.useState<string | null>(null);
  const [addPending, startAddTransition] = React.useTransition();

  const fetchUsers = React.useCallback(
    async (accountId: string): Promise<AccountUserItem[]> => {
      const res = await listAccountUsersAction(accountId);
      if (res.error) toast.error(res.error);
      return res.data ?? [];
    },
    [toast],
  );

  // Recarrega mantendo a lista atual na tela até a nova chegar (o spinner é só da primeira carga).
  const load = async (accountId: string) => setUsers(await fetchUsers(accountId));

  React.useEffect(() => {
    let alive = true;
    void fetchUsers(account.id).then((list) => {
      if (alive) setUsers(list);
    });
    return () => {
      alive = false;
    };
  }, [account.id, fetchUsers]);

  function addUser(e: React.FormEvent) {
    e.preventDefault();
    startAddTransition(async () => {
      const res = await createUserAction({ accountId: account.id, name: newName, email: newEmail });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Usuário criado.");
      setNewLink(res.data?.setupLink ?? null);
      setNewName("");
      setNewEmail("");
      load(account.id);
      router.refresh();
    });
  }

  async function handleNewLink(userId: string) {
    setBusyUserId(userId);
    const res = await newSetupLinkAction(userId);
    setBusyUserId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) setLinks((prev) => ({ ...prev, [userId]: res.data!.setupLink }));
  }

  async function handleToggleActive(user: AccountUserItem) {
    if (user.isActive) {
      const ok = await confirmDialog(`Desativar o acesso de ${user.name}? A pessoa não conseguirá mais entrar até ser reativada.`, {
        destructive: true,
        confirmLabel: "Desativar",
      });
      if (!ok) return;
    }
    setBusyUserId(user.id);
    const res = await setUserActiveAction(user.id, !user.isActive);
    setBusyUserId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(user.isActive ? "Usuário desativado." : "Usuário reativado.");
    void load(account.id);
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title="Usuários" description={account.name} size="lg">
      <div className="space-y-4">
        {users === null ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <p className="py-2 text-sm text-muted">Nenhum usuário ainda.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {users.map((u) => (
              <div key={u.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="min-w-[160px] flex-1">
                    <div className="text-sm text-foreground">{u.name}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </div>
                  <Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "ativo" : "inativo"}</Badge>
                  <span className="text-[11px] text-muted" title={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : undefined}>
                    {u.lastLoginAt ? `entrou ${formatRelative(u.lastLoginAt)}` : "nunca entrou"}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button size="sm" variant="outline" loading={busyUserId === u.id} onClick={() => handleNewLink(u.id)}>
                      Novo link de senha
                    </Button>
                    <Button size="sm" variant={u.isActive ? "danger" : "secondary"} loading={busyUserId === u.id} onClick={() => handleToggleActive(u)}>
                      {u.isActive ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </div>
                {links[u.id] ? (
                  <div className="mt-2">
                    <CopyBox label="Link para definir senha" value={links[u.id]} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <div className="mb-2 text-xs font-medium text-muted">Adicionar usuário</div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={addUser}>
            <Field label="Nome" className="min-w-[140px] flex-1">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field label="E-mail" className="min-w-[180px] flex-1">
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </Field>
            <Button type="submit" loading={addPending}>
              <UserPlus className="h-4 w-4" /> Adicionar
            </Button>
          </form>
          {newLink ? (
            <div className="mt-2">
              <CopyBox label="Link para definir senha" value={newLink} />
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
