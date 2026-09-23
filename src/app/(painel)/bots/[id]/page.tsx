import { notFound } from "next/navigation";
import { requireAccount } from "@/server/auth/guards";
import { getBot } from "@/server/services/bots";
import { listKnowledge } from "@/server/services/knowledge";
import { listNumbers } from "@/server/services/numbers";
import { CHAT_MODEL_OPTIONS } from "@/server/ai/provider";
import { parseFaq } from "@/server/ai/text";
import { StudioClient } from "./studio-client";

export const metadata = { title: "Studio do bot" };

export default async function BotStudioPage({ params }: PageProps<"/bots/[id]">) {
  const { id } = await params;
  const { account } = await requireAccount();
  const bot = await getBot(account.id, id);
  if (!bot) notFound();

  const [knowledge, numbers] = await Promise.all([listKnowledge(account.id, id), listNumbers(account.id)]);
  const numbersCount = numbers.filter((n) => n.number.botId === id).length;

  return (
    <StudioClient
      bot={{
        id: bot.id,
        name: bot.name,
        config: bot.config,
        version: bot.version,
        publishedAt: bot.publishedAt ? bot.publishedAt.toISOString() : null,
        isActive: bot.isActive,
        templateKey: bot.templateKey,
      }}
      numbersCount={numbersCount}
      knowledge={knowledge.map((k) => ({
        id: k.id,
        kind: k.kind,
        title: k.title,
        status: k.status,
        error: k.error,
        chunkCount: k.chunkCount,
        charCount: k.charCount,
        createdAt: k.createdAt.toISOString(),
        content: k.kind === "faq" ? "" : k.content,
        pairs: k.kind === "faq" ? parseFaq(k.content) : null,
      }))}
      chatModelOptions={CHAT_MODEL_OPTIONS}
    />
  );
}
