"use client";

import { Card, CardHeader, Field, Input, Switch, Textarea } from "@/components/ui/primitives";
import type { BotConfig } from "@/shared/bot-config";

export function AcoesTab({ config, patch }: { config: BotConfig; patch: (p: Record<string, unknown>) => void }) {
  const a = config.actions;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Chamar atendente"
          description="Transfere a conversa para um humano."
          action={<Switch checked={a.handoff.enabled} onChange={(v) => patch({ actions: { handoff: { enabled: v } } })} />}
        />
        <div className="p-4">
          <Field label="Mensagem ao chamar" hint="Enviada ao cliente quando o bot aciona um atendente.">
            <Textarea
              value={a.handoff.message}
              onChange={(e) => patch({ actions: { handoff: { message: e.target.value } } })}
              maxLength={400}
              className="min-h-[70px]"
              disabled={!a.handoff.enabled}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Enviar cardápio/catálogo"
          description="Manda uma imagem ou PDF quando o cliente pedir."
          action={<Switch checked={a.sendMenu.enabled} onChange={(v) => patch({ actions: { sendMenu: { enabled: v } } })} />}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Palavra usada pelo bot" hint='Ex.: "cardápio", "catálogo".'>
            <Input value={a.sendMenu.label} onChange={(e) => patch({ actions: { sendMenu: { label: e.target.value } } })} disabled={!a.sendMenu.enabled} maxLength={60} />
          </Field>
          <Field label="Link do arquivo" hint="Link público de uma imagem ou PDF do cardápio/catálogo.">
            <Input value={a.sendMenu.mediaUrl} onChange={(e) => patch({ actions: { sendMenu: { mediaUrl: e.target.value } } })} disabled={!a.sendMenu.enabled} maxLength={500} />
          </Field>
          <Field label="Legenda" className="sm:col-span-2">
            <Input value={a.sendMenu.caption} onChange={(e) => patch({ actions: { sendMenu: { caption: e.target.value } } })} disabled={!a.sendMenu.enabled} maxLength={300} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Enviar localização"
          description="Manda o endereço fixado no mapa."
          action={<Switch checked={a.sendLocation.enabled} onChange={(v) => patch({ actions: { sendLocation: { enabled: v } } })} />}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Nome do local">
            <Input value={a.sendLocation.name} onChange={(e) => patch({ actions: { sendLocation: { name: e.target.value } } })} disabled={!a.sendLocation.enabled} maxLength={120} />
          </Field>
          <Field label="Endereço">
            <Input value={a.sendLocation.address} onChange={(e) => patch({ actions: { sendLocation: { address: e.target.value } } })} disabled={!a.sendLocation.enabled} maxLength={300} />
          </Field>
          <Field label="Latitude">
            <Input
              type="number"
              step="any"
              value={a.sendLocation.lat}
              onChange={(e) => patch({ actions: { sendLocation: { lat: e.target.value === "" ? 0 : Number(e.target.value) } } })}
              disabled={!a.sendLocation.enabled}
            />
          </Field>
          <Field label="Longitude">
            <Input
              type="number"
              step="any"
              value={a.sendLocation.lng}
              onChange={(e) => patch({ actions: { sendLocation: { lng: e.target.value === "" ? 0 : Number(e.target.value) } } })}
              disabled={!a.sendLocation.enabled}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Coletar pedido"
          description="Orienta o bot a anotar um pedido estruturado."
          action={<Switch checked={a.collectOrder.enabled} onChange={(v) => patch({ actions: { collectOrder: { enabled: v } } })} />}
        />
        <div className="p-4">
          <Field label="Instruções para coletar o pedido" hint="Ex.: itens, tamanho, entrega ou retirada, pagamento, nome.">
            <Textarea
              value={a.collectOrder.instructions}
              onChange={(e) => patch({ actions: { collectOrder: { instructions: e.target.value } } })}
              disabled={!a.collectOrder.enabled}
              maxLength={1200}
              className="min-h-[90px]"
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
