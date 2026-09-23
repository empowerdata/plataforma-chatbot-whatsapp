"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input } from "./primitives";

/** Modal genérico. */
export function Modal({ open, onClose, title, description, children, footer, size = "md", className }: { open: boolean; onClose: () => void; title?: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn("relative w-full rounded-lg border border-border-strong bg-surface-1 shadow-2xl animate-scale-in", width, className)}>
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
              {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- DialogsProvider
// Nunca usar window.confirm/prompt/alert (quebram em alguns webviews). Usar useDialogs().

type ConfirmOpts = { title?: string; destructive?: boolean; confirmLabel?: string; cancelLabel?: string };
type PromptOpts = { title?: string; placeholder?: string; confirmLabel?: string; multiline?: boolean };

type DialogState =
  | { kind: "confirm"; message: string; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; message: string; initial: string; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: "alert"; message: string; title?: string; resolve: () => void }
  | null;

type DialogsApi = {
  confirmDialog: (message: string, opts?: ConfirmOpts) => Promise<boolean>;
  promptDialog: (message: string, initial?: string, opts?: PromptOpts) => Promise<string | null>;
  alertDialog: (message: string, title?: string) => Promise<void>;
};

const DialogsContext = React.createContext<DialogsApi | null>(null);

export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DialogState>(null);
  const [value, setValue] = React.useState("");

  const api = React.useMemo<DialogsApi>(
    () => ({
      confirmDialog: (message, opts = {}) => new Promise((resolve) => setState({ kind: "confirm", message, opts, resolve })),
      promptDialog: (message, initial = "", opts = {}) =>
        new Promise((resolve) => {
          setValue(initial);
          setState({ kind: "prompt", message, initial, opts, resolve });
        }),
      alertDialog: (message, title) => new Promise((resolve) => setState({ kind: "alert", message, title, resolve })),
    }),
    [],
  );

  const close = () => setState(null);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {state?.kind === "confirm" && (
        <Modal
          open
          size="sm"
          title={state.opts.title ?? "Confirmar"}
          onClose={() => {
            state.resolve(false);
            close();
          }}
          footer={
            <>
              <Button variant="ghost" onClick={() => { state.resolve(false); close(); }}>
                {state.opts.cancelLabel ?? "Cancelar"}
              </Button>
              <Button variant={state.opts.destructive ? "danger" : "primary"} autoFocus onClick={() => { state.resolve(true); close(); }}>
                {state.opts.confirmLabel ?? "Confirmar"}
              </Button>
            </>
          }
        >
          <p className="text-sm text-foreground whitespace-pre-line">{state.message}</p>
        </Modal>
      )}
      {state?.kind === "prompt" && (
        <Modal
          open
          size="sm"
          title={state.opts.title ?? state.message}
          onClose={() => { state.resolve(null); close(); }}
          footer={
            <>
              <Button variant="ghost" onClick={() => { state.resolve(null); close(); }}>Cancelar</Button>
              <Button onClick={() => { state.resolve(value); close(); }}>{state.opts.confirmLabel ?? "OK"}</Button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              state.resolve(value);
              close();
            }}
          >
            {state.opts.title ? <p className="mb-2 text-sm text-muted">{state.message}</p> : null}
            <Input autoFocus value={value} placeholder={state.opts.placeholder} onChange={(e) => setValue(e.target.value)} />
          </form>
        </Modal>
      )}
      {state?.kind === "alert" && (
        <Modal open size="sm" title={state.title ?? "Aviso"} onClose={() => { state.resolve(); close(); }} footer={<Button autoFocus onClick={() => { state.resolve(); close(); }}>OK</Button>}>
          <p className="text-sm text-foreground whitespace-pre-line">{state.message}</p>
        </Modal>
      )}
    </DialogsContext.Provider>
  );
}

export function useDialogs(): DialogsApi {
  const ctx = React.useContext(DialogsContext);
  if (!ctx) throw new Error("useDialogs precisa do DialogsProvider no layout raiz.");
  return ctx;
}
