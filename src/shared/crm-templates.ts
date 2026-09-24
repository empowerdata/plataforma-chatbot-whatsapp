/**
 * Funis prontos por segmento do cliente. O funil de cada cliente nasce daqui
 * (pelo campo "segmento" do cadastro) e depois o cliente ou o aluno ajustam.
 *
 * Tipo da etapa: "open" (em andamento), "won" (virou cliente: compareceu,
 * fechou, comprou) ou "lost" (não virou). É o tipo, e não o nome, que faz a
 * conversão do funil ser calculada sozinha. `asksDate`: ao mover um lead para
 * a etapa, a tela pede data e hora (agendamento, aula experimental, visita).
 */
export type StageKind = "open" | "won" | "lost";
export type StageTemplate = { name: string; kind: StageKind; asksDate?: boolean };
export type PipelineTemplate = { key: string; label: string; stages: StageTemplate[] };

const NOVO: StageTemplate = { name: "Novo", kind: "open" };
const EM_ATENDIMENTO: StageTemplate = { name: "Em atendimento", kind: "open" };
const PERDIDO: StageTemplate = { name: "Perdido", kind: "lost" };

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    key: "clinica",
    label: "Clínica / consultório",
    stages: [NOVO, EM_ATENDIMENTO, { name: "Ficou de agendar", kind: "open" }, { name: "Agendado", kind: "open", asksDate: true }, { name: "Compareceu", kind: "won" }, { name: "Faltou", kind: "lost" }, PERDIDO],
  },
  {
    key: "salao",
    label: "Salão / barbearia / estética",
    stages: [NOVO, EM_ATENDIMENTO, { name: "Agendado", kind: "open", asksDate: true }, { name: "Atendido", kind: "won" }, { name: "Faltou", kind: "lost" }, PERDIDO],
  },
  {
    key: "personal",
    label: "Personal / academia",
    stages: [NOVO, EM_ATENDIMENTO, { name: "Aula experimental", kind: "open", asksDate: true }, { name: "Negociando", kind: "open" }, { name: "Fechou", kind: "won" }, PERDIDO],
  },
  {
    key: "delivery",
    label: "Delivery / restaurante",
    stages: [NOVO, EM_ATENDIMENTO, { name: "Comprou", kind: "won" }, PERDIDO],
  },
  {
    key: "loja",
    label: "Loja / comércio",
    stages: [NOVO, EM_ATENDIMENTO, { name: "Orçamento enviado", kind: "open" }, { name: "Comprou", kind: "won" }, PERDIDO],
  },
  {
    key: "imobiliaria",
    label: "Imobiliária",
    stages: [NOVO, EM_ATENDIMENTO, { name: "Visita agendada", kind: "open", asksDate: true }, { name: "Proposta", kind: "open" }, { name: "Fechou", kind: "won" }, PERDIDO],
  },
  {
    key: "servicos",
    label: "Serviços (padrão)",
    stages: [NOVO, EM_ATENDIMENTO, { name: "Proposta enviada", kind: "open" }, { name: "Fechou", kind: "won" }, PERDIDO],
  },
];

const KEYWORDS: [string, RegExp][] = [
  ["clinica", /clinic|consult|odont|dentis|medic|psicol|fisio|nutri|saude|terap|veterin/],
  ["salao", /salao|barbear|estetic|beleza|cabele|manicure|spa|sobrancelha|depila/],
  ["personal", /personal|academia|treino|pilates|crossfit|yoga|funcional/],
  ["delivery", /pizz|delivery|restaur|lanch|hamburg|comida|marmit|padaria|doceria|acai/],
  ["loja", /loja|comercio|varejo|ecommerce|e-commerce|roupa|moda/],
  ["imobiliaria", /imobil|imovel|imoveis|corretor/],
];

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Funil pelo segmento digitado no cadastro do cliente ("Clínica odontológica" → clínica). */
export function templateForSegment(segment: string | null | undefined): PipelineTemplate {
  const s = normalize(segment ?? "");
  const hit = KEYWORDS.find(([, re]) => re.test(s));
  return PIPELINE_TEMPLATES.find((t) => t.key === (hit?.[0] ?? "servicos"))!;
}

/** Motivos de perda oferecidos ao mover um lead para uma etapa de perda (mais "Outro" com texto livre). */
export const LOST_REASONS = ["Preço", "Sem horário que sirva", "Parou de responder", "Escolheu outro lugar", "Sem interesse", "Não compareceu", "Outro"] as const;

/** Tempo sem resposta do lead para ele aparecer como "esfriando" e "frio". */
export const COOLING_DAYS = 3;
export const COLD_DAYS = 7;
