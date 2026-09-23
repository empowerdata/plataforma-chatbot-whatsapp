"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };
type ToastApi = { toast: (message: string, kind?: Toast["kind"]) => void; success: (m: string) => void; error: (m: string) => void };

const ToastContext = React.createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const remove = React.useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const api = React.useMemo<ToastApi>(() => {
    const toast = (message: string, kind: Toast["kind"] = "info") => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l, { id, kind, message }]);
      setTimeout(() => remove(id), kind === "error" ? 6000 : 3500);
    };
    return { toast, success: (m) => toast(m, "success"), error: (m) => toast(m, "error") };
  }, [remove]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm shadow-lg animate-fade-in-up bg-surface-2",
              t.kind === "success" && "border-success/30",
              t.kind === "error" && "border-danger/40",
              t.kind === "info" && "border-border-strong",
            )}
          >
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : t.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />}
            <span className="flex-1 text-foreground">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-foreground" aria-label="Fechar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa do ToastProvider.");
  return ctx;
}
