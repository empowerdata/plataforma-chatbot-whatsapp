"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button, Spinner } from "@/components/ui/primitives";
import { formatPhone } from "@/lib/utils";

type ConnectionInfo = {
  status: string;
  qr: string | null;
  pairingCode: string | null;
  phone: string | null;
  profileName: string | null;
  lastError: string | null;
};

/** Modal de QR/código de pareamento. Consulta GET /api/numeros/[id]/conexao a cada 3s enquanto aberto. */
export function ConexaoModal({ open, onClose, numberId, simulated }: { open: boolean; onClose: () => void; numberId: string; simulated?: boolean }) {
  const [info, setInfo] = React.useState<ConnectionInfo | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(
    async (refresh?: boolean) => {
      try {
        const res = await fetch(`/api/numeros/${numberId}/conexao${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
        if (res.ok) setInfo(await res.json());
      } catch {
        // silencioso: a próxima tentativa de polling tenta de novo
      }
    },
    [numberId],
  );

  React.useEffect(() => {
    if (!open) {
      setInfo(null);
      return;
    }
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [open, load]);

  async function gerarNovoQr() {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }

  const connected = info?.status === "open";

  return (
    <Modal open={open} onClose={onClose} title="Conectar WhatsApp" size="sm">
      <div className="flex flex-col items-center gap-4 py-1 text-center">
        {connected ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-success" />
            <div>
              <div className="text-sm font-semibold text-foreground">Conectado</div>
              <div className="mt-1 text-sm text-muted">
                {formatPhone(info.phone)}
                {info.profileName ? ` · ${info.profileName}` : ""}
              </div>
            </div>
            <Button onClick={onClose}>Concluir</Button>
          </>
        ) : (
          <>
            <div className="flex h-[260px] w-[260px] shrink-0 items-center justify-center rounded-md border border-border bg-white">
              {info?.qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image não se aplica
                <img src={info.qr} alt="QR code para conectar o WhatsApp" className="h-full w-full object-contain p-2" />
              ) : info?.pairingCode ? (
                <div className="px-3 font-mono text-3xl font-bold tracking-[0.25em] text-[#111]">{info.pairingCode}</div>
              ) : (
                <Spinner className="h-6 w-6" />
              )}
            </div>

            <p className="text-xs text-muted">
              No celular do cliente: WhatsApp → Configurações (ou ⋮) → Dispositivos conectados → Conectar dispositivo → aponte a câmera para este QR.
            </p>

            <Button variant="outline" size="sm" loading={refreshing} onClick={gerarNovoQr}>
              <RefreshCw className="h-3.5 w-3.5" /> Gerar novo QR
            </Button>

            {simulated ? (
              <p className="w-full rounded-md bg-info-soft px-3 py-2 text-xs text-info">
                Ambiente de desenvolvimento: use a página Simulador para &quot;ler&quot; o QR.
              </p>
            ) : null}
          </>
        )}

        {info?.lastError ? <p className="w-full rounded-md bg-danger-soft px-3 py-2 text-left text-xs text-danger">{info.lastError}</p> : null}
      </div>
    </Modal>
  );
}
