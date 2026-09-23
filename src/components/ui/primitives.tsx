"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-strong shadow-sm",
  secondary: "bg-surface-2 text-foreground hover:bg-surface-3 border border-border",
  outline: "bg-transparent text-foreground border border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-muted hover:text-foreground hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white border border-transparent",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-8 w-8 p-0",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 ease-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Inputs

const fieldBase =
  "w-full rounded-md border border-border bg-surface-1 px-3 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-9", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-[96px] py-2 leading-relaxed", className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-9 appearance-none pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238b98a8%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_10px_center]", className)} {...props}>
      {children}
    </select>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-xs font-medium text-muted mb-1.5", className)} {...props} />;
}

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0", className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("inline-flex items-center gap-2 text-sm text-foreground disabled:opacity-50", !label && "gap-0")}
    >
      <span className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200", checked ? "bg-accent" : "bg-surface-3 border border-border-strong")}>
        <span className={cn("absolute h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- Badge / status
// Tone, numberStatusMeta etc. moram em ./status (módulo sem "use client") porque
// são chamados direto em Server Components. Reexportados aqui por conveniência.

export { type Tone, numberStatusMeta } from "./status";
import { toneClasses, toneDotClasses, type Tone } from "./status";

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4", toneClasses[tone], className)}>{children}</span>;
}

export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", toneDotClasses[tone], pulse && "animate-pulse-soft")} />;
}

// ---------------------------------------------------------------- Card / layout

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface-1", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong px-6 py-14 text-center animate-fade-in-up">
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-muted", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

/** Bloco de código/valor copiável. */
export function CopyBox({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        {label ? <div className="text-[10px] uppercase tracking-wide text-subtle">{label}</div> : null}
        <div className="truncate font-mono text-xs text-foreground">{value}</div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}
