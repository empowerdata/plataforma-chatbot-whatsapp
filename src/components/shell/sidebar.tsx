"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Smartphone, Bot, Building2, MessagesSquare, BarChart3, KanbanSquare, CalendarCheck, Plug, Settings, FlaskConical, Users, Server, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof icons; badge?: number };

const icons = { LayoutDashboard, Smartphone, Bot, Building2, MessagesSquare, BarChart3, KanbanSquare, CalendarCheck, Plug, Settings, FlaskConical, Users, Server, ScrollText };

export function Sidebar({ productName, sections }: { productName: string; sections: { title?: string; items: NavItem[] }[] }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface-1">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
          <MessagesSquare className="h-4 w-4" />
        </div>
        <span className="truncate text-sm font-semibold tracking-tight">{productName}</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {sections.map((section, i) => (
          <div key={i} className={cn(i > 0 && "mt-5")}>
            {section.title ? <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">{section.title}</div> : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = icons[item.icon];
                const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
                        active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2/60 hover:text-foreground",
                      )}
                    >
                      {active ? <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" /> : null}
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-subtle group-hover:text-muted")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge ? <span className="rounded-full bg-warning-soft px-1.5 text-[10px] font-semibold text-warning">{item.badge}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
