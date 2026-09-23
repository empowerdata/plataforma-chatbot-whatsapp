import { z } from "zod";

/** Ajustes por número que sobrescrevem o comportamento do bot atribuído. */
export const numberSettingsSchema = z.object({
  /** Telefone (E.164 sem +) que recebe aviso quando o bot pede humano. */
  notifyPhone: z.string().max(40).optional(),
  /** Horas que o bot fica em silêncio num contato após resposta humana. */
  pauseHoursOnHuman: z.number().min(0).max(72).optional(),
  /** Segundos que o bot espera para juntar mensagens seguidas. */
  debounceSeconds: z.number().min(0).max(30).optional(),
  /** Horas de inatividade para considerar uma conversa encerrada. */
  conversationTimeoutHours: z.number().min(1).max(168).optional(),
});

export type NumberSettings = z.infer<typeof numberSettingsSchema>;
