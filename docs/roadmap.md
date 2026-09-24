# Roadmap

Para o histórico de decisões e o porquê de cada uma, ver
`docs/visao-e-decisoes.md` — este arquivo é só a lista de fases.

## Feito

- **Painel completo**: login, contas, servidores Evolution, eventos, clientes,
  números com QR/pareamento, bots com Studio + base de conhecimento +
  playground, integrações (OpenAI; banco das conversas já vem pronto,
  Supabase opcional), configurações, simulador de WhatsApp para dev.
- **Caixa de entrada** (`/conversas` para a equipe, `/portal/conversas` para
  o cliente final): três colunas (lista · conversa · contato), busca, abas
  (em aberto, precisa de você, finalizadas, todas), responder pelo painel,
  interruptor do bot por conversa com o motivo de estar pausado/desligado,
  categoria, finalizar/reabrir, notas internas, atualização automática a
  cada 5 s.
- **Portal do cliente final** (`/portal`): login próprio (`role: "client"`,
  escopado a um `client_id`), nunca alcança dados de outro cliente da mesma
  conta nem o painel da equipe (reforçado em `requireAccount`/
  `getAccountOrThrow`, não só escondido na UI). O aluno concede o acesso pela
  tela de Clientes (link de "definir senha"). Cai direto na caixa de
  entrada; indicadores (em aberto, finalizadas no período, por categoria) em
  outra aba — sem Kanban ainda.
- **Banco das conversas no próprio servidor**: serviço `dados` (pgvector) no
  VPS, mesmo banco do painel no Render. O aluno não configura banco nenhum.
- **Engine**: debounce por contato, RAG com pgvector (ou busca textual sem
  chave), ferramentas (atendente humano, cardápio, localização,
  categorização automática da conversa), pausa quando humano responde,
  horário de funcionamento, transcrição de áudio, **visão em imagens** (o bot
  enxerga a foto que o cliente manda, não só o aviso "recebi uma imagem"),
  estatísticas diárias, filtro de período (7/30/90 dias), limpeza automática
  de conversas com mais de 30 dias.
- **Distribuição**: instalação de conta única via VPS (`infra/`, caminho
  principal, ~R$ 30/mês) ou via Render (`render.yaml`, mais caro, sem
  terminal). Nenhuma delas depende de infraestrutura operada pela Daxus.
- **Testes**: unitários, banco das conversas (mesmo SQL de produção, via
  PGlite) e ponta a ponta com Evolution simulada, incluindo caixa de
  entrada, interruptor do bot e escopo do cliente final.
- **Documentação**: `docs/visao-e-decisoes.md` (a história e o porquê),
  `docs/arquitetura.md`, `docs/convencoes.md`, guias de instalação.

## Fase 0 — prova real (precisa de VPS + chip)

Em andamento. A instalação já rodou num VPS real (Hostinger, 2026-09-24) e
corrigiu três bugs que bloqueavam toda instalação. Falta o resto de
`docs/fase0-checklist.md` com WhatsApp real. É o próximo passo antes de
qualquer divulgação para alunos.

## Fase 1 — piloto com alunos de verdade

- Termo de uso (deixar explícito: instalação e operação são do aluno).
- Ajustes do que a Fase 0 revelar (cliente HTTP do Evolution, tempo real de
  instalação, capacidade real do VPS recomendado).
- Vídeo/curso mostrando o passo a passo de instalação e o Playground (para
  quem ainda não instalou conseguir ver o produto funcionando).
- Piloto com 2–3 alunos, 1 cliente cada. Coletar: tempo de instalação,
  dúvidas, qualidade das respostas do bot.

## Fase 2 — qualidade

- **Resumo por contato**, atualizado sozinho quando a conversa termina e
  guardado além da limpeza de 30 dias (ficha do contato + contexto do bot).
  Ver avaliação em `docs/visao-e-decisoes.md`.
- Custo estimado por conversa/número no painel (tokens × preço do modelo).
- Alertas por e-mail/WhatsApp quando um número cai (hoje só evento no painel).
- Versões do bot com histórico e "voltar para versão".
- Importar cardápio de foto/PDF com extração estruturada.

## Fase 3 — produto

- Caixa de entrada, próximos passos: respostas rápidas (atalho "/"), enviar
  arquivo/áudio pelo painel, "não lidas", talvez tema claro no portal.
- **Google Agenda** para clínicas, salões e personal trainers: consultar
  horários livres e marcar pelo bot, via conta de serviço do Google (o
  cliente final só compartilha a agenda). Ver avaliação em
  `docs/visao-e-decisoes.md`.
- **Kanban de leads (mini-CRM)**, usando a categorização de conversas e o
  status aberto/finalizado já construídos como base — cada categoria pode
  virar uma coluna, sem retrabalho de schema.
- Canal oficial do WhatsApp (Meta Cloud API) como alternativa ao
  Evolution/Baileys.
- Domínio e marca próprios por instalação (o aluno já pode fazer isso hoje
  manualmente; deixar mais guiado).

## Descartado, não esquecido

- ~~Evolution hospedada pela Daxus, com auto-escala~~ — contradiz a decisão
  de a Daxus nunca operar infraestrutura de produção de aluno. Ver
  "Tentativa 1" em `docs/visao-e-decisoes.md`. Se um aluno individualmente
  quiser mais de um servidor Evolution para a própria instalação, a
  arquitetura já suporta isso (tabela `evolution_nodes`) — a diferença é que
  é o aluno que sobe e paga o segundo servidor, não a Daxus.
