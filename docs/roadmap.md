# Roadmap

Para o histórico de decisões e o porquê de cada uma, ver
`docs/visao-e-decisoes.md` — este arquivo é só a lista de fases.

## Feito

- **Painel completo**: login, contas, servidores Evolution, eventos, clientes,
  números com QR/pareamento, bots com Studio + base de conhecimento +
  playground, conversas (com categorização e filtros), integrações (Supabase
  e OpenAI), configurações, simulador de WhatsApp para dev.
- **Engine**: debounce por contato, RAG com pgvector (ou busca textual sem
  chave), ferramentas (atendente humano, cardápio, localização,
  categorização automática da conversa), pausa quando humano responde,
  horário de funcionamento, transcrição de áudio, estatísticas diárias,
  filtro de período (7/30/90 dias), limpeza automática de conversas com mais
  de 30 dias.
- **Distribuição**: instalação de conta única via VPS (`infra/`, caminho
  principal, ~R$ 30/mês) ou via Render (`render.yaml`, mais caro, sem
  terminal). Nenhuma delas depende de infraestrutura operada pela Daxus.
- **Testes**: unitários, banco do aluno (mesmo SQL do Supabase, via PGlite) e
  ponta a ponta com Evolution simulada.
- **Documentação**: `docs/visao-e-decisoes.md` (a história e o porquê),
  `docs/arquitetura.md`, `docs/convencoes.md`, guias de instalação.

## Fase 0 — prova real (precisa de VPS + chip)

Ainda não feita. Ver `docs/fase0-checklist.md`. É o próximo passo antes de
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

- Imagens com visão (o bot entende a foto).
- Resumo automático da conversa (campo `summary`, ainda não usado).
- Custo estimado por conversa/número no painel (tokens × preço do modelo).
- Alertas por e-mail/WhatsApp quando um número cai (hoje só evento no painel).
- Versões do bot com histórico e "voltar para versão".
- Importar cardápio de foto/PDF com extração estruturada.

## Fase 3 — produto

- Inbox com resposta humana pela plataforma (hoje o dono responde pelo
  celular).
- **Portal do cliente final** (a pizzaria vê os próprios leads e
  estatísticas). Vira a escada de upsell do aluno para o cliente dele.
- **Kanban de leads (mini-CRM)**, usando a categorização de conversas já
  construída como base — cada categoria pode virar uma coluna, sem
  retrabalho de schema.
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
