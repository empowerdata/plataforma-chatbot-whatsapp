import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DialogsProvider } from "@/components/ui/dialog";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "Plataforma de Atendimento", template: "%s · Plataforma de Atendimento" },
  description: "Gestão de chatbots de WhatsApp para pequenos negócios.",
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-full antialiased">
        <ToastProvider>
          <DialogsProvider>{children}</DialogsProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
