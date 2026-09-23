"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode; badge?: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-border", className)} role="tablist">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative -mb-px flex items-center gap-1.5 px-3 py-2 text-sm transition-colors",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {it.label}
            {it.badge}
            {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}
