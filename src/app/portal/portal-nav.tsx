"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/portal", label: "Visão geral" },
  { href: "/portal/conversas", label: "Conversas" },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-border bg-surface-1 px-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl gap-1">
        {ITEMS.map((item) => {
          const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "border-b-2 px-3 py-2.5 text-sm transition-colors",
                active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
