"use client";

import { Field, Input, Switch, Textarea } from "@/components/ui/primitives";
import { weekDayLabels, weekDays, type BotConfig, type WeekDay } from "@/shared/bot-config";

const timeInputClass =
  "h-9 rounded-md border border-border bg-surface-1 px-2 text-sm text-foreground transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25";

export function NegocioTab({ config, patch }: { config: BotConfig; patch: (p: Record<string, unknown>) => void }) {
  const b = config.business;
  const hours = b.hours;

  function toggleDay(day: WeekDay, open: boolean) {
    const existing = hours.days[day];
    patch({ business: { hours: { days: { [day]: existing ? { ...existing, open } : { open, from: "08:00", to: "18:00" } } } } });
  }
  function setDayTime(day: WeekDay, field: "from" | "to", value: string) {
    const existing = hours.days[day] ?? { open: true, from: "08:00", to: "18:00" };
    patch({ business: { hours: { days: { [day]: { ...existing, [field]: value } } } } });
  }

  return (
    <div className="space-y-5">
      <Field label="Descrição do negócio" hint="Contexto geral que o bot usa para responder.">
        <Textarea value={b.description} onChange={(e) => patch({ business: { description: e.target.value } })} maxLength={2000} className="min-h-[100px]" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Endereço">
          <Input value={b.address} onChange={(e) => patch({ business: { address: e.target.value } })} maxLength={300} />
        </Field>
        <Field label="Telefone">
          <Input value={b.phone} onChange={(e) => patch({ business: { phone: e.target.value } })} maxLength={40} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site">
          <Input value={b.site} onChange={(e) => patch({ business: { site: e.target.value } })} maxLength={200} />
        </Field>
        <Field label="Formas de pagamento">
          <Input value={b.paymentMethods} onChange={(e) => patch({ business: { paymentMethods: e.target.value } })} maxLength={300} />
        </Field>
      </div>
      <Field label="Entrega" hint="Área atendida, taxa, prazo médio…">
        <Textarea value={b.deliveryInfo} onChange={(e) => patch({ business: { deliveryInfo: e.target.value } })} maxLength={600} className="min-h-[80px]" />
      </Field>

      <div className="rounded-lg border border-border p-4">
        <Switch checked={hours.enabled} onChange={(v) => patch({ business: { hours: { enabled: v } } })} label="Usar horário de funcionamento" />
        {hours.enabled ? (
          <div className="mt-4 space-y-3">
            <Field label="Fuso horário" className="max-w-xs">
              <Input value={hours.timezone} onChange={(e) => patch({ business: { hours: { timezone: e.target.value } } })} placeholder="America/Sao_Paulo" />
            </Field>
            <div className="space-y-2">
              {weekDays.map((day) => {
                const d = hours.days[day];
                const open = d?.open ?? false;
                return (
                  <div key={day} className="flex flex-wrap items-center gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
                    <div className="w-28 shrink-0">
                      <Switch checked={open} onChange={(v) => toggleDay(day, v)} label={weekDayLabels[day]} />
                    </div>
                    {open ? (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <input type="time" value={d?.from ?? "08:00"} onChange={(e) => setDayTime(day, "from", e.target.value)} className={timeInputClass} />
                        <span>até</span>
                        <input type="time" value={d?.to ?? "18:00"} onChange={(e) => setDayTime(day, "to", e.target.value)} className={timeInputClass} />
                      </div>
                    ) : (
                      <span className="text-xs text-subtle">Fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
