"use client";

import { LogOut, ArrowLeftRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function Topbar({
  userName,
  userEmail,
  isPlatformAdmin,
  actingAs,
  onLogout,
  onStopActing,
}: {
  userName: string;
  userEmail: string;
  /** true só para quem administra várias contas hospedadas (não é o caso do aluno numa instalação própria). */
  isPlatformAdmin: boolean;
  actingAs: { accountName: string } | null;
  onLogout: () => Promise<void>;
  onStopActing: () => Promise<void>;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3 text-sm">
        {actingAs ? (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs text-warning">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>
              Atuando como <strong className="font-semibold">{actingAs.accountName}</strong>
            </span>
            <form action={onStopActing}>
              <button className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-warning hover:bg-warning/20" type="submit">
                <ArrowLeftRight className="h-3 w-3" /> trocar
              </button>
            </form>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <div className="text-sm font-medium">{userName}</div>
          <div className="text-[11px] text-muted">{isPlatformAdmin ? "Administrador da plataforma" : userEmail}</div>
        </div>
        <form action={onLogout}>
          <Button variant="ghost" size="icon" type="submit" title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
