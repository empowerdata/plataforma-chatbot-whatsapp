"use client";

import { useRouter } from "next/navigation";

/** Na equipe, o funil é sempre de um cliente: este seletor troca qual (via ?cl=). */
export function ClientPicker({ clients, value, basePath }: { clients: { id: string; name: string }[]; value: string; basePath: string }) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) => router.push(`${basePath}?cl=${e.target.value}`)}
      aria-label="Cliente"
      className="h-8 max-w-56 appearance-none rounded-md border border-accent/40 bg-surface-1 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238b98a8%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_8px_center] bg-no-repeat pl-2.5 pr-7 text-xs text-foreground focus:border-accent/60 focus:outline-none"
    >
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
