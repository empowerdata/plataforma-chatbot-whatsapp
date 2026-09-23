import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./index";
import { hashPassword } from "../auth/password";
import { createNumber, assignBot } from "../services/numbers";
import { createBot } from "../services/bots";
import { addTextItem } from "../services/knowledge";
import { createClient } from "../services/clients";
import { getFakeEvolution } from "../evolution/fake";
import { logEvent } from "../services/events";

export const DEMO_USER = { email: "demo@local.test", password: "demo123" };

/**
 * Conta de demonstração para desenvolvimento: uma agência com dois clientes,
 * bots prontos, um número conectado (Evolution simulada) e outro aguardando QR.
 * Só roda quando não existe nenhuma conta.
 */
export async function seedDemo(): Promise<void> {
  const db = await getDb();
  const [any] = await db.select({ id: schema.accounts.id }).from(schema.accounts).limit(1);
  if (any) return;
  console.log("[seed] criando conta de demonstração…");

  const [account] = await db
    .insert(schema.accounts)
    .values({ name: "Agência Demo", slug: "demo", plan: { includedNumbers: 3, maxNumbers: 0, maxBots: 0 }, notes: "Conta criada automaticamente em desenvolvimento." })
    .returning();
  await db.insert(schema.integrations).values({ accountId: account.id });
  await db.insert(schema.users).values({ accountId: account.id, name: "Aluno Demo", email: DEMO_USER.email, role: "member", passwordHash: await hashPassword(DEMO_USER.password) });

  const pizzaria = await createClient(account.id, { name: "Pizzaria Bella Massa", segment: "Pizzaria / delivery", contactName: "Marcos", contactPhone: "5511999990001", city: "São Paulo" });
  const barbearia = await createClient(account.id, { name: "Barbearia do Léo", segment: "Barbearia", contactName: "Léo", contactPhone: "5511999990002", city: "Campinas" });

  const botPizza = await createBot({ accountId: account.id, name: "Atendente da Bella Massa", templateKey: "pizzaria", businessName: "Pizzaria Bella Massa" });
  await addTextItem({
    accountId: account.id,
    botId: botPizza.id,
    title: "Cardápio",
    content: [
      "CARDÁPIO PIZZARIA BELLA MASSA",
      "",
      "Pizzas tradicionais (grande 8 fatias / média 6 fatias):",
      "Mussarela: R$ 45 grande, R$ 38 média.",
      "Calabresa: R$ 48 grande, R$ 40 média.",
      "Marguerita: R$ 52 grande, R$ 44 média.",
      "Portuguesa: R$ 55 grande, R$ 46 média.",
      "Frango com catupiry: R$ 56 grande, R$ 47 média.",
      "Quatro queijos: R$ 58 grande, R$ 49 média.",
      "",
      "Pizzas doces: Chocolate com morango R$ 50, Romeu e Julieta R$ 46.",
      "Bebidas: Refrigerante lata R$ 6, Refrigerante 2L R$ 14, Suco natural R$ 9, Água R$ 4.",
      "",
      "Horário: terça a domingo, das 18h às 23h30. Segunda fechado.",
      "Entrega: taxa de R$ 6 no centro e R$ 10 nos bairros vizinhos. Tempo médio 40 a 50 minutos.",
      "Pagamento: Pix, cartão na entrega, dinheiro (informe o troco).",
      "Endereço para retirada: Rua das Flores, 120, Centro.",
    ].join("\n"),
  });

  const botBarber = await createBot({ accountId: account.id, name: "Assistente da Barbearia", templateKey: "salao", businessName: "Barbearia do Léo" });
  await addTextItem({
    accountId: account.id,
    botId: botBarber.id,
    title: "Serviços e preços",
    content: "Corte masculino R$ 45 (40 min). Barba R$ 35 (30 min). Corte + barba R$ 70. Pigmentação R$ 40. Atendemos de terça a sábado, das 9h às 19h, com hora marcada. Endereço: Av. Brasil, 900, Campinas.",
  });

  // Número 1: conectado (simulado)
  const n1 = await createNumber({ accountId: account.id, label: "Bella Massa — WhatsApp principal", clientId: pizzaria.id });
  await assignBot(account.id, n1.id, botPizza.id);
  await db.update(schema.numbers).set({ variables: { nome_empresa: "Pizzaria Bella Massa" }, settings: { notifyPhone: "5511999990001" } }).where(eq(schema.numbers.id, n1.id));
  const fake = getFakeEvolution();
  await fake.simulateScan(n1.instanceName, "5511988880001", "Pizzaria Bella Massa");

  // Número 2: aguardando QR
  const n2 = await createNumber({ accountId: account.id, label: "Barbearia do Léo", clientId: barbearia.id });
  await assignBot(account.id, n2.id, botBarber.id);

  await logEvent({ accountId: account.id, type: "seed", message: "Conta de demonstração criada. Login: demo@local.test / demo123" });

  // Algumas conversas de exemplo (as respostas chegam pelo debounce em alguns segundos).
  await fake.simulateIncoming(n1.instanceName, { fromPhone: "5511977770001", text: "Oi, boa noite! Vocês entregam no centro?", pushName: "Juliana" });
  await fake.simulateIncoming(n1.instanceName, { fromPhone: "5511977770002", text: "Quero ver o cardápio", pushName: "Rafael" });
  await fake.simulateIncoming(n1.instanceName, { fromPhone: "5511977770003", text: "Quero falar com um atendente", pushName: "Dona Célia" });
  console.log("[seed] conta de demonstração pronta: demo@local.test / demo123");
}
