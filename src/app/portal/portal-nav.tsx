"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/portal/conversas", label: "Conversas", icon: MessagesSquare },
  { href: "/portal", label: "Indicadores", icon: BarChart3 },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors", active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground")}
          >
            <item.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
