import { requireAccount } from "@/server/auth/guards";
import { listBots } from "@/server/services/bots";
import { BotsClient, type BotCardData } from "./bots-client";

export const metadata = { title: "Bots" };

export default async function BotsPage() {
  const { account } = await requireAccount();
  const items = await listBots(account.id);

  const bots: BotCardData[] = items.map(({ bot, numbers, knowledge }) => ({
    id: bot.id,
    name: bot.name,
    templateKey: bot.templateKey,
    businessName: bot.config?.identity?.businessName ?? "",
    version: bot.version,
    publishedAt: bot.publishedAt ? bot.publishedAt.toISOString() : null,
    isActive: bot.isActive,
    numbers,
    knowledge,
  }));

  return <BotsClient bots={bots} />;
}
