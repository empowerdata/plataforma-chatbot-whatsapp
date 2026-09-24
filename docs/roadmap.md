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
  (abertas, aguardando, finalizadas, todas), filtros por cliente, número e
  categoria, lista de altura fixa que aguenta centenas de conversas (60 por
  vez, "carregar mais" até 600), uma situação só e clara por conversa
  (aguardando você · bot atendendo · com a equipe · finalizada), responder
  pelo painel, interruptor do bot por conversa com o motivo de estar
  pausado/desligado, categoria, finalizar/reabrir, notas internas,
  atualização automática a cada 5 s. Visual compacto (redesenho de
  2026-09-24).
- **Arquivos e áudio na conversa**: pelo painel a equipe e o cliente final
  enviam foto, vídeo, documento (até 16 MB) e áudio gravado no navegador (vai
  como mensagem de voz). As mídias recebidas e enviadas aparecem na conversa
  (foto em miniatura que amplia, player de áudio com a transcrição, documento
  para baixar), buscadas no WhatsApp na hora — nada fica guardado no servidor.
- **Todo número pertence a um cliente** (obrigatório ao cadastrar e ao
  editar), e o filtro por cliente fica sempre à vista para a equipe.
- **CRM (funil de leads)** — `/funil` e `/hoje` para a equipe (por cliente),
  `/portal/funil` e `/portal/hoje` para o cliente: funil pronto pelo segmento
  e editável, quadro com arrastar e lista com mover em lote, ficha do lead
  (próxima ação, agendamento, interesse, valor, notas, linha do tempo,
  apagar a pedido), tela Hoje, sinais "aguardando vocês" e "esfriando",
  etapa dentro da conversa e funil de vendas nos Indicadores. Toda pessoa
  que escreve vira lead; as etapas são movidas por pessoas.
- **Conversas não são mais apagadas** (limpeza opcional); quem volta a
  conversar aparece uma vez na lista, com o histórico inteiro. A categoria do
  bot virou sugestão, confirmada por uma pessoa.
- **Indicadores** (`/indicadores` para a equipe, com filtro por cliente;
  `/portal` para o cliente final): conversas iniciadas (com variação sobre o
  período anterior), em aberto e aguardando agora, finalizadas, % resolvida
  só pelo bot, gráficos de conversas por dia, assuntos (categorias),
  horário das mensagens e, para a equipe, conversas por cliente. Todo
  gráfico tem a mesma informação em tabela.
- **Portal do cliente final** (`/portal`): login próprio (`role: "client"`,
  escopado a um `client_id`), nunca alcança dados de outro cliente da mesma
  conta nem o painel da equipe (reforçado em `requireAccount`/
  `getAccountOrThrow`, não só escondido na UI). O aluno concede o acesso pela
  tela de Clientes (link de "definir senha"). Cai direto na caixa de
  entrada; os indicadores ficam na outra aba — sem Kanban ainda.
- **Banco das conversas no próprio servidor**: serviço `dados` (pgvector) no
  VPS, mesmo banco do painel no Render. O aluno não configura banco nenhum.
- **Engine**: debounce por contato, RAG com pgvector (ou busca textual sem
  chave), ferramentas (atendente humano, cardápio, localização,
  categorização automática da conversa), pausa quando humano responde,
  horário de funcionamento, transcrição de áudio, **visão em imagens** (o bot
  enxerga a foto que o cliente manda, não só o aviso "recebi uma imagem"),
  estatísticas diárias, filtro de período (7/30/90 dias), limpeza opcional
  de conversas antigas (desligada por padrão).
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
- **Atualizar sem terminal** (fazer junto com as duas versões, antes de
  divulgar). Hoje o aluno fica sabendo pelo aviso do Lorennzo (comunidade
  do curso) e cola o comando do instalador de novo, pelo terminal do
  navegador da VPS. Plano: o painel compara a versão dele com a última
  versão estável no GitHub e mostra "nova versão disponível", com o que
  mudou e um botão **Atualizar agora**. O painel não mexe no servidor
  direto (dar esse poder ao container seria um risco de segurança): ele só
  deixa um pedido de atualização, e um agendador do próprio servidor,
  instalado pelo `provision.sh`, vê o pedido e roda a atualização.
  Atualizar sozinho sem o aluno pedir foi descartado de propósito: uma
  versão com problema quebraria todas as instalações ao mesmo tempo.
- **Duas versões: teste e estável** (decidido pelo Lorennzo em 2026-09-24,
  fazer antes de divulgar). Hoje o instalador pega sempre o que está no
  `main`, então qualquer mudança publicada chega na hora a quem instala ou
  atualiza. Plano: o `main` vira a versão de teste; um ramo `estavel` passa
  a ser o que o instalador e a atualização dos alunos usam; a VPS atual do
  Lorennzo acompanha o `main` e serve de ambiente de teste; uma mudança só
  vai para o `estavel` depois de testada lá. Se ele também atender clientes
  reais, uma segunda VPS no `estavel` vira a produção dele.
- Ajustes do que a Fase 0 revelar (cliente HTTP do Evolution, tempo real de
  instalação, capacidade real do VPS recomendado).
- Vídeo/curso mostrando o passo a passo de instalação e o Playground (para
  quem ainda não instalou conseguir ver o produto funcionando).
- Piloto com 2–3 alunos, 1 cliente cada. Coletar: tempo de instalação,
  dúvidas, qualidade das respostas do bot.

## Fase 2 — qualidade

- Custo estimado por conversa/número no painel (tokens × preço do modelo).
- Alertas por e-mail/WhatsApp quando um número cai (hoje só evento no painel).
- Versões do bot com histórico e "voltar para versão".
- Importar cardápio de foto/PDF com extração estruturada.

## Fase 3 — produto

- Caixa de entrada, próximos passos: respostas rápidas (atalho "/"), "não
  lidas", talvez tema claro no portal.
- **Agenda (Google Agenda e afins)** para clínicas, salões e personal
  trainers, em etapas:
  1. **Link secreto iCal** (recomendado para começar): o cliente cola o
     "Endereço secreto no formato iCal" da agenda no portal; o bot lê os
     horários ocupados, sugere os livres e passa o horário escolhido para a
     equipe confirmar. Nada para o aluno configurar.
  2. **Marcação automática**, por um destes: Cal.com com chave de API (o
     cliente conecta o Google lá dentro) ou botão "Conectar com Google" (o
     aluno registra o app do Google uma vez; ressalvas de app não verificado
     e domínio próprio).
  3. Remarcar/cancelar e lembretes.
  Alternativas avaliadas (agenda própria na plataforma, conta de serviço)
  e ressalvas em `docs/visao-e-decisoes.md`.
- **CRM, fase C** (a seguir): ao fim de cada conversa o bot anota sinais com
  a frase que provou e sugere interesse e etapa (a equipe aceita com um
  clique); resumo por lead, que o bot também lê quando a pessoa volta;
  retorno com mensagens prontas; lembrete de consulta na véspera.
- **CRM, fase D**: agenda conectada (link iCal), vários atendentes com
  responsável por lead, reativação automática com limites.
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
