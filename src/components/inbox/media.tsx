"use client";

import * as React from "react";
import { Download, FileText, ImageOff } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { InboxMedia } from "./types";

/*
  Mídia dentro do balão. O arquivo vem de /api/inbox/media/[id], que busca no
  WhatsApp na hora: por isso áudio e vídeo só carregam quando alguém dá play
  (preload="none") — uma conversa com 20 áudios não dispara 20 downloads.
*/

export function MediaView({ media }: { media: InboxMedia }) {
  const [failed, setFailed] = React.useState(false);
  const [zoom, setZoom] = React.useState(false);

  if (failed) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs italic text-muted">
        <ImageOff className="h-3.5 w-3.5 shrink-0" /> Mídia indisponível (pode ter expirado no WhatsApp)
      </div>
    );
  }

  switch (media.kind) {
    case "image":
    case "sticker":
      return (
        <>
          <button type="button" onClick={() => setZoom(true)} className="block overflow-hidden rounded-lg" aria-label="Ampliar imagem">
            {/* eslint-disable-next-line @next/next/no-img-element -- arquivo servido pela nossa rota, next/image não se aplica */}
            <img src={media.url} alt={media.fileName ?? "Imagem"} loading="lazy" onError={() => setFailed(true)} className={cn("block w-auto max-w-full object-contain", media.kind === "sticker" ? "max-h-32" : "max-h-72")} />
          </button>
          {zoom ? (
            <Modal open onClose={() => setZoom(false)} size="xl" title={media.fileName ?? "Imagem"} description={<a href={`${media.url}?download=1`} className="text-accent hover:underline">Baixar</a>}>
              {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
              <img src={media.url} alt={media.fileName ?? "Imagem"} className="mx-auto max-h-[62vh] w-auto max-w-full rounded-md object-contain" />
            </Modal>
          ) : null}
        </>
      );
    case "video":
      return <video src={media.url} controls preload="none" onError={() => setFailed(true)} className="block max-h-72 w-72 max-w-full rounded-lg bg-black/40" />;
    case "audio":
      return <audio src={media.url} controls preload="none" onError={() => setFailed(true)} className="block h-10 w-[260px] max-w-full [color-scheme:dark]" />;
    default:
      return (
        <a href={`${media.url}?download=1`} className="flex min-w-[200px] items-center gap-2.5 rounded-lg bg-black/20 px-3 py-2 transition-colors hover:bg-black/30" title="Baixar">
          <FileText className="h-5 w-5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate text-[13px]">{media.fileName ?? "Documento"}</span>
          <Download className="h-4 w-4 shrink-0 text-muted" />
        </a>
      );
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function formatDuration(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------- gravação

const MAX_SECONDS = 5 * 60;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
}

export type Recording = { blob: Blob; url: string; seconds: number };

/**
 * Grava áudio pelo microfone do navegador. Só funciona em endereço com cadeado
 * (https) ou localhost — regra do navegador, não nossa. Para em 5 minutos.
 */
export function useVoiceRecorder(onError: (message: string) => void) {
  const [state, setState] = React.useState<"idle" | "recording" | "recorded">("idle");
  const [seconds, setSeconds] = React.useState(0);
  const [recording, setRecording] = React.useState<Recording | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = React.useRef(false);

  const release = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Saiu da conversa no meio da gravação: solta o microfone.
  React.useEffect(() => release, [release]);

  const stop = React.useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError("Este navegador não permite gravar áudio aqui. Use um endereço com cadeado (https).");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Sem acesso ao microfone. Libere o microfone para este site nas permissões do navegador.");
      return;
    }
    streamRef.current = stream;
    const mimeType = pickMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    discardRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      release();
      if (discardRef.current) {
        setState("idle");
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      setRecording({ blob, url: URL.createObjectURL(blob), seconds: Math.round((Date.now() - startedAt) / 1000) });
      setState("recorded");
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setState("recording");
    timerRef.current = setInterval(() => {
      const s = Math.round((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
  }, [onError, release, stop]);

  const discard = React.useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      discardRef.current = true;
      recorderRef.current.stop();
    }
    setRecording((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
    setState("idle");
  }, []);

  return { state, seconds, recording, start, stop, discard };
}
