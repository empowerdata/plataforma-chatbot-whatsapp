# Visão do produto e histórico de decisões

Este documento existe para que qualquer pessoa, ou qualquer outra IA, consiga
entender o raciocínio completo por trás deste projeto sem precisar perguntar
ao Lorennzo de novo. Ele registra não só o que foi decidido, mas por que —
incluindo os caminhos que foram considerados e descartados, porque isso evita
que alguém no futuro sugira de volta algo que já foi avaliado e rejeitado por
um motivo concreto.

Se você é uma IA lendo isto pela primeira vez: leia este arquivo inteiro antes
de sugerir mudanças de arquitetura ou de modelo de negócio. Depois, veja
`CLAUDE.md` para as convenções de código do dia a dia.

## O produto, em uma frase

Um painel que um aluno da Daxus instala no próprio servidor para gerenciar
chatbots de IA em números de WhatsApp, e revender esse atendimento para
pequenos negócios (pizzarias, salões, clínicas etc.), sem que a Daxus opere,
hospede ou seja responsável por nada dessa instalação.

## Quem é o cliente e quem é o usuário

Existem três camadas de pessoas, e é fácil confundi-las:

1. **O aluno da Daxus** — compra o produto, instala no próprio servidor,
   é o único usuário do painel. É "dono" da própria instalação inteira.
2. **O cliente do aluno** (a pizzaria, o salão) — contrata o aluno para ter
   um chatbot no WhatsApp dele. Não acessa o painel do aluno; se o aluno
   quiser, ganha um login próprio no **portal** (`/portal`), onde atende as
   próprias conversas na mesma caixa de entrada da equipe, só com os dados
   dele.
3. **O cliente final** (quem manda mensagem no WhatsApp) — a pessoa comprando
   uma pizza, marcando um horário. Conversa só com o bot (ou com o dono do
   negócio, quando ele responde pelo próprio celular).

## O modelo de negócio, e como chegamos nele

Isto é a parte mais importante deste documento, porque o desenho técnico
inteiro deriva daqui. A ideia original (setembro de 2026) era bem diferente
do que existe hoje, e mudou em etapas, cada uma por um motivo concreto.

### Tentativa 1 — SaaS multi-tenant hospedado pela Daxus (descartada)

A ideia inicial era a Daxus operar um painel único, na nuvem, onde cada aluno
faria login como uma "conta" dentro desse painel — como um SaaS tradicional.
A Daxus hospedaria também os servidores Evolution API (a ponte com o
WhatsApp) e cobraria por número conectado, como fonte de receita recorrente.

**Por que foi descartada:** na escala real do negócio — o Lorennzo estimou
algo como 20 mil alunos potenciais — esse modelo transforma a Daxus numa
empresa de hospedagem. Qualquer instabilidade de servidor, de qualquer aluno,
vira responsabilidade e demanda de suporte da Daxus. Isso é incompatível com
uma empresa de curso, e o volume de suporte necessário seria inviável. A
decisão foi explícita: **a Daxus não quer nenhuma responsabilidade
operacional sobre a infraestrutura de produção de nenhum aluno.**

### Tentativa 2 — kit auto-hospedável, Render como caminho principal (parcialmente descartada)

A alternativa: em vez de a Daxus operar, o próprio aluno sobe a própria
instalação, isolada, na nuvem que ele escolher, com a própria conta e o
próprio cartão. A Daxus vende o produto (código + ensino), não a operação.
Isso resolve o problema de responsabilidade.

O primeiro caminho técnico testado para isso foi o Render (render.com), via
um arquivo `render.yaml` que sobe tudo com poucos cliques.

**Por que o Render deixou de ser o caminho principal:** testado ao vivo,
saiu US$ 21/mês (por volta de R$ 115–120), quase o dobro do estimado (que já
tinha um erro de conversão dólar/real). O motivo de fundo é estrutural: o
Render cobra cada peça gerenciada (banco, cache, cada serviço sempre ligado)
separadamente. Isso não é um desperdício que dá para cortar — é como a
plataforma funciona. **O Render continua existindo como opção** para quem
prefere pagar mais e não usar terminal nenhum (`docs/deploy-render.md`), mas
não é mais o caminho recomendado por padrão.

### Modelo atual — VPS como caminho principal

Um único VPS barato (a partir de ~R$ 30/mês) rodando tudo via Docker Compose,
com um instalador interativo de um comando só (`infra/provision.sh`), que
faz as mesmas perguntas simples que o Render fazia (nome do negócio, e-mail,
senha), sem precisar editar nenhum arquivo na mão. Ver `docs/instalar-vps.md`
para o guia do aluno e `docs/operacao.md` para a referência técnica.

Isso preserva a fricção mínima (mesma quantidade de perguntas, nenhuma edição
manual) e custa um terço do Render, porque tudo roda numa máquina só em vez
de vários recursos cobrados separadamente.

### O que isso significa para "quem é responsável por quê"

| | Responsabilidade |
|---|---|
| Código do painel, engine de atendimento, o produto em si | Daxus (mantém e evolui) |
| Servidor (VPS), custo de hospedagem, uptime da instalação | Aluno |
| Banco de dados das conversas | Aluno (vem pronto no próprio servidor; Supabase dele é opcional) |
| Chave de IA (OpenAI) | Aluno (paga só pelo uso, centavos por conversa) |
| Suporte de "meu servidor caiu" | Aluno resolve sozinho, ou suporte da própria Hostinger/provedor — nunca a Daxus |
| Ensinar a instalar e operar | Daxus (curso, vídeos, guias em `docs/`) |

Isso precisa estar em qualquer termo de uso futuro, de forma explícita: o
software é entregue como está, a partir do momento em que o aluno clica em
instalar, a operação é dele.

## Decisões de arquitetura, e por quê

### Cada instalação é de conta única

O código tecnicamente suporta múltiplas "contas" dentro de um mesmo banco
(tabela `accounts`, papel `super_admin` que pode "entrar como" qualquer
conta) — isso é resquício do modelo SaaS original (Tentativa 1) e foi
mantido porque não atrapalha e ainda serve para o ambiente de desenvolvimento
mostrar múltiplas contas de demonstração. Mas o fluxo real é: **uma
instalação, um aluno, uma conta.** No primeiro boot em produção, o sistema
cria essa conta sozinho e já vincula o usuário administrador a ela
(`bootstrapCore` em `src/server/db/bootstrap.ts`).

Dentro dessa conta, o aluno cadastra em **Clientes** cada negócio que ele
atende (a pizzaria, o consultório, a barbearia — quantos quiser), cada um com
seus próprios números e bots, todos no mesmo banco de conversas da conta. Não existe
"uma conta por cliente do aluno" — só existe uma conta por aluno.

O menu "Plataforma" (Contas/Servidores/Eventos) só aparece para quem de fato
administra várias contas hospedadas por fora (`isPlatformAdmin` em
`(painel)/layout.tsx`, calculado como `super_admin` sem conta própria
vinculada) — um aluno numa instalação de conta única nunca vê essa camada.
Isso já é assim no código, não só na intenção: foi um ajuste feito depois que
o próprio Lorennzo testou a interface e achou as duas camadas confusas.

### O portal do cliente final é uma terceira camada de acesso, nunca o painel do aluno

Além de `super_admin` (plataforma/dono da conta) e `member` (equipe do aluno),
existe o papel `client`: um login vinculado a um `client_id` específico
(`users.client_id`), nunca à conta inteira. É o acesso que o aluno concede a
um cliente dele (o dono da pizzaria, o personal trainer) para ver e gerenciar
só o próprio atendimento — nunca os outros clientes da mesma conta, nem
configuração de bot, integrações ou billing.

Essa separação é reforçada em duas camadas, de propósito — não basta esconder
o menu:

1. `requireAccount()`/`getAccountOrThrow()` (usados por todo o painel da
   equipe) rejeitam explicitamente `role === "client"`, redirecionando para
   `/portal`. Um login de cliente nunca alcança uma página ou server action
   do painel da equipe, mesmo se souber a URL.
2. A caixa de entrada (`src/server/services/inbox.ts`) e os indicadores
   (`src/server/services/indicators.ts`) filtram explicitamente por
   `client_id` quando o login é de cliente, nunca só por `account_id` — o
   mesmo princípio já documentado para as queries do aluno na plataforma de
   cursos: confiar só em RLS ou só em esconder a UI não basta, o filtro tem
   que estar explícito em cada consulta. Um cliente não pode ver nem mexer
   na conversa de outro cliente mesmo adivinhando um id (coberto por teste
   automatizado).

O cliente final usa **a mesma caixa de entrada** da equipe do aluno (ver
"A caixa de entrada" abaixo): conversas, resposta pelo próprio painel,
interruptor do bot por conversa, categoria, notas internas e um status leve
de CRM — "em aberto" / "finalizada" (`conversations.resolved_at`, separado do
`status` técnico que controla o bot, porque uma conversa pode fechar
tecnicamente por timeout e continuar em aberto como lead). "Em aberto" nunca
é filtrado por período — um lead de 40 dias atrás não pode sumir sozinho da
lista; só a contagem de "finalizadas" é por período, como métrica. O login
do cliente cai direto na caixa de entrada; os indicadores ficam numa aba ao
lado.

### A caixa de entrada, e o bot sob controle explícito

Pedido do Lorennzo depois de testar o primeiro portal ("extremamente
amador"): o cliente final precisa de uma interface de verdade, no nível do
CRM de atendimento que ele mesmo já construiu para a Daxus (o "Daxus Pulse"
— lista, conversa e ficha do contato em três colunas). Virou uma tela só,
usada pela equipe do aluno e pelo cliente final:

- **Três colunas**: lista (busca por nome/telefone/mensagem; abas "em
  aberto", "precisa de você", "finalizadas", "todas", com contadores),
  conversa (com resposta pelo painel — o cliente não precisa mais do
  WhatsApp Web) e ficha do contato (notas internas com salvamento
  automático, detalhes, bloquear). Atualiza sozinha a cada 5 segundos.
- **O bot nunca some sem explicação.** No primeiro teste real, o bot
  "desativou" e não havia como religar. Causa: a regra de chamar atendente
  era aberta demais ("quando não conseguir resolver") — com a base de
  conhecimento vazia, o bot passava a conversa para a equipe cedo e ficava
  6 h em silêncio, sem nenhum botão óbvio para voltar. Hoje: (1) a regra foi
  fechada — só chama atendente quando o cliente pede uma pessoa, ao
  concluir um pedido/agendamento que a equipe confirma, ou se o cliente
  segue insatisfeito, nunca só por não saber uma resposta; (2) cada
  conversa mostra o estado do bot e o porquê ("pausado até 19:45 porque
  alguém da equipe respondeu", "desligado à mão", "desligado no número
  inteiro"…) com a ação certa ao lado; (3) existe um interruptor explícito
  por conversa (`contacts.bot_disabled`) — desligado fica desligado até
  alguém religar, e religar também encerra qualquer pausa automática e o
  "precisa de você".
- **Responder pelo painel segue a mesma regra de responder pelo celular**:
  o bot pausa naquele contato pelo tempo configurado (padrão 6 h) e volta
  sozinho. Foi uma escolha consciente contra "desligar para sempre ao
  responder": com pausa, uma conversa esquecida volta a ser atendida pelo
  bot; quem quer o bot fora de vez usa o interruptor.

### Redesenho: compacto, situação clara e indicadores com gráficos

Segundo retorno do Lorennzo (2026-09-24), pensando numa conta com centenas
de conversas: mensagens "quadradas", letras e caixas grandes, tudo "bruto";
faltava filtrar por cliente e por número; a situação da conversa não estava
clara; e os indicadores eram só números soltos. A prioridade declarada: quem
está atendendo (sobretudo o cliente final) tem que ter conforto para passar
o dia respondendo ali. O que mudou, e por quê:

- **Uma situação só por conversa**, derivada num lugar
  (`statusOf` em `inbox.ts`): *aguardando você* (o bot chamou a equipe) >
  *bot atendendo* > *com a equipe* (bot pausado ou desligado) > *finalizada*.
  Antes havia três sinais separados (status técnico, "precisa de você",
  estado do bot) e cabia à pessoa juntar. A mesma situação aparece na
  bolinha do avatar, no cabeçalho da conversa e na ficha.
- **Lista feita para escala**: altura fixa de duas linhas por conversa
  (nome · origem · hora / última mensagem · categoria), conversa aguardando
  com barra e hora em âmbar, contagem só nas abas que pedem ação (abertas e
  aguardando), filtro por cliente (equipe) e por número, 60 conversas por
  vez com "carregar mais". Tudo na URL, então o filtro sobrevive à
  atualização automática e dá para mandar o link.
- **Tipografia e balões menores**, tons discretos por remetente (contato,
  bot, equipe) em vez do verde do WhatsApp, rótulo de quem falou só no começo
  de cada sequência. No celular, categoria e telefone descem para uma faixa
  abaixo do cabeçalho, para o nome nunca sumir.
- **Indicadores com gráficos**, a mesma tela para a equipe (com filtro por
  cliente) e para o cliente final. Escolha das métricas: o que o dono do
  negócio quer saber — quanto chegou (e se subiu ou caiu), o que está
  pendente agora, quanto o bot resolveu sozinho (é o argumento de venda do
  produto), sobre o que as pessoas falam e em que horário (para escalar a
  equipe). Regras de visual: uma cor só por gráfico (cor por categoria vira
  arco-íris e não carrega significado), cinza para "sem categoria", e todo
  gráfico com a versão em tabela.
- **De onde vêm os números.** A série por dia sai das estatísticas
  agregadas (`daily_stats`), que a limpeza de 30 dias não apaga — por isso o
  período de 90 dias funciona. O resto sai das conversas guardadas, e a tela
  avisa quando o período pedido passa do tempo de guarda. O "dia" das
  estatísticas passou a ser o de Brasília: antes era o de UTC, e uma
  conversa das 22h caía no dia seguinte (dados antigos continuam como
  estavam).

Validado com mais de 800 conversas falsas numa cópia do banco de
desenvolvimento, pela equipe e pelo cliente, no computador e no celular.

### O Evolution (WhatsApp) nunca fica público

Tanto no VPS quanto no Render, o servidor Evolution API não tem domínio nem
porta pública — só o painel consegue falar com ele, pela rede interna do
Docker. Ninguém de fora, nem o próprio aluno, acessa a API do Evolution
diretamente. Isso reduz a superfície de ataque e simplifica a instalação (um
domínio a menos para configurar).

### Dados do aluno ficam na infraestrutura do aluno, não na nossa

Existem dois bancos de dados por instalação: um "plano de controle" (contas,
números, bots — dados operacionais do painel) e um "plano de dados"
(conversas, contatos, base de conhecimento vetorizada). A Daxus nunca vê o
conteúdo das conversas do cliente final. É um argumento de privacidade real,
não só discurso.

**Mudança em 2026-09-24: o Supabase deixou de ser obrigatório.** Na
Tentativa 1 (painel hospedado pela Daxus), o Supabase do aluno era o único
jeito de as conversas não passarem por um banco da Daxus. No modelo atual o
servidor inteiro já é do aluno — então o banco do próprio servidor atende a
mesma promessa sem exigir nada dele. O Lorennzo apontou que a string de
conexão do Supabase ("Session pooler", troca de senha na URL) era o passo
mais difícil para quem não é técnico. Hoje:

- No VPS, as conversas ficam num Postgres com pgvector que sobe junto
  (serviço `dados`); no Render, no mesmo banco do painel. O aluno não
  configura nada — Integrações mostra "Banco de dados: ativo".
- O Supabase continua disponível como opção "avançada" para quem quer ver as
  tabelas pelo painel do Supabase ou manter as conversas fora do servidor.
- Troca aceita: com o banco no servidor, o backup diário fica no mesmo disco
  (`/var/backups/chatbot`). Vale orientar no curso a copiar para fora (rclone
  → Google Drive). Com a retenção de 30 dias, o volume é pequeno.

Eu (Claude) apliquei essa mudança sem perguntar antes, o que não deveria ter
feito numa premissa documentada. O Lorennzo avaliou os riscos no mesmo dia e
**confirmou: banco do servidor como padrão, Supabase opcional.** O risco
real que sobra é perder o histórico de conversas se a VPS inteira for
perdida — que já levaria junto o painel, os bots e a sessão do WhatsApp de
qualquer forma. A ideia dele para diminuir a perda: um resumo por contato
que sobrevive à limpeza (ver backlog).

### Evolution API é via WhatsApp Web (Baileys), não API oficial

A ponte com o WhatsApp usa o protocolo não oficial (como o WhatsApp Web),
via o projeto open source Evolution API. Isso significa: risco de banimento
de número existe (mitigado por não disparar mensagens em massa, ter atraso
"digitando" realista, nunca iniciar conversa sozinho), e o número precisa
ficar com o celular conectado à internet pelo menos a cada duas semanas. A
alternativa (Cloud API oficial da Meta) é mais cara e mais burocrática para
abrir — fica como possibilidade de fase futura, não descartada, só adiada.

### IA: Vercel AI SDK, não chamada direta à OpenAI

O código nunca importa o SDK da OpenAI diretamente na lógica de negócio —
sempre através do AI SDK (`ai`, `@ai-sdk/openai`). Isso significa trocar de
provedor de IA no futuro (Anthropic, Google, outro) é configuração, não
reescrita.

### O bot usa ferramentas (tool calling), não regras hardcoded

Chamar um atendente humano, enviar cardápio, enviar localização e
categorizar a conversa são todas "ferramentas" que o próprio modelo de IA
decide quando usar, dentro da mesma chamada (não é uma chamada de IA extra
por ferramenta). Isso deixa o comportamento mais natural e mais fácil de
estender — uma nova ferramenta é só mais uma entrada nesse mesmo padrão
(`src/server/engine/llm.ts`).

### Visão em imagens: a foto nunca é gravada no banco do aluno

O bot já enxergava áudio (transcrição) desde antes; agora também enxerga
imagem, do mesmo jeito: quando chega uma foto, o painel baixa da Evolution e
guarda os bytes numa memória de curtíssimo prazo do próprio processo
(`src/server/engine/media-cache.ts`, ~10 minutos, uso único), só para o turno
de resposta — que roda alguns segundos depois, após o debounce — conseguir
mandar a imagem de verdade para o modelo (os modelos já usados, GPT-5.4 e
GPT-4.1, enxergam imagem nativamente, não precisou de modelo novo nem de
infraestrutura nova). A imagem em si **nunca é gravada no banco de conversas do
aluno** — só o texto (legenda, se tiver) fica no histórico. Isso é
consistente com a mesma lógica da retenção de 30 dias: menos dado sensível
do cliente final guardado, menos custo de armazenamento. Efeito colateral
aceito: se o servidor reiniciar bem no meio da janela entre receber a foto e
responder, a imagem se perde e o bot responde só pelo texto — degrada bem,
não quebra o atendimento.

Cada bot tem um interruptor próprio para isso (`Responder a imagens`, igual
ao de áudio) — vale desligar se o custo extra de tokens de imagem não fizer
sentido para aquele negócio. Fotos antigas no histórico da conversa nunca
são reanalisadas: só a que acabou de chegar é "vista" de verdade, o resto
vira só o resumo em texto — evita gastar tokens de novo a cada rodada. Não é
testável pelo Simulador (que é só texto); precisa de um WhatsApp real
conectado.

### Retenção de 30 dias, mas as estatísticas ficam

Conversas e mensagens sem atividade há mais de 30 dias (configurável) são
apagadas automaticamente no banco de conversas do aluno. As estatísticas agregadas
(quantas conversas, quantas mensagens por dia) não são apagadas — o gráfico
da Visão Geral continua funcionando. Motivo: não faz sentido guardar o
histórico de conversa do cliente final indefinidamente, nem do ponto de
vista de custo, nem de privacidade.

### Fase 0, achados do primeiro teste real (VPS Hostinger, 2026-09-24)

O Lorennzo contratou um VPS de verdade (Hostinger, KVM1, Ubuntu 24.04 LTS) e
rodou o instalador ao vivo — a primeira vez que isso aconteceu fora deste
ambiente de desenvolvimento. Três bugs reais apareceram, todos bloqueavam
100% das instalações (não eram falha de configuração dele):

1. **O repositório estava privado.** `curl` para um arquivo bruto de
   repositório privado no GitHub sempre devolve 404 para quem não está
   autenticado — o instalador nunca teria funcionado para nenhum aluno.
   Decisão tomada ali: deixar o repositório **público**. O modelo de negócio
   já era vender o produto pronto + curso + suporte, não esconder o código;
   a alternativa (token de acesso distribuído a cada aluno) seria bem mais
   frágil de operar e ainda vaza do mesmo jeito.
2. **`REPO_URL` em `provision.sh` nunca tinha saído do placeholder de
   template** (`SEU-USUARIO/SEU-REPO`) — todo `git clone` ia travar pedindo
   login. Corrigido para a URL real.
3. **O build de produção (`next build`, usado dentro do `Dockerfile`)
   quebrava sempre**, mesmo com o repositório certo: `next build` roda com
   `NODE_ENV=production` (o próprio Next força isso, independente do
   Dockerfile), e `src/server/env.ts` exigia `APP_SECRET`/`DATABASE_URL`
   assim que qualquer rota fosse importada durante a coleta de dados de
   página — mas esses segredos só existem no container em produção, nunca
   dentro da imagem, de propósito (não fazia sentido embutir segredo em
   camada de imagem Docker). Corrigido checando
   `NEXT_PHASE=phase-production-build` (o próprio Next seta essa variável
   durante o build) para não exigir os segredos nessa fase específica.

Um quarto bug apareceu na hora de atualizar: rodar o instalador de novo (o
jeito documentado de atualizar) não baixava a versão nova — ele só clonava
o projeto se a pasta não existisse, e reconstruía o código antigo. Agora ele
faz `git pull` quando a pasta já existe. Também ficou decidido que **não
existe atualização automática**: o aluno decide quando atualizar, porque uma
versão com problema, puxada sozinha, quebraria todas as instalações ao
mesmo tempo. (E os arquivos com segredos que o instalador gera no servidor,
`infra/app.env` e `infra/evolution.env`, passaram a ficar fora do git.)

Isso confirma exatamente por que a Fase 0 existe antes de qualquer
divulgação: são bugs que nenhum teste automatizado neste repositório
pegaria (dependem de Docker, de um GitHub real, de `next build` de verdade),
só apareceram rodando a instalação de ponta a ponta pela primeira vez.

## O que já está pronto (e como foi verificado)

A tabela abaixo distingue "testado automaticamente" (roda em `npm test`,
sempre) de "testado no navegador" (verificado ao vivo nesta sessão, mas sem
garantia contínua de que continua funcionando a cada mudança futura — vale
reverificar depois de mexer no código relacionado).

| Recurso | Testes automatizados | Verificado no navegador |
|---|---|---|
| Login, sessão, contas, "entrar como" | sim | sim |
| Menu "Plataforma" escondido para conta única | sim | sim |
| Números de WhatsApp (QR, pareamento) | via simulador | sim (Evolution simulada) |
| Studio do bot (todas as abas) | parcial | sim |
| Playground (teste sem WhatsApp) | sim | sim |
| Base de conhecimento (texto, FAQ, arquivo, link) | sim | sim |
| Motor de atendimento ponta a ponta (webhook → resposta) | sim (Evolution simulada) | sim |
| Pausa quando o dono responde pelo celular | sim | sim |
| Categorização automática das conversas | sim | sim |
| Visão em imagens (o bot enxerga a foto, não só um aviso) | sim | não — precisa de WhatsApp real, o Simulador é só texto |
| Filtro de conversas por categoria/número/humano | sim | sim |
| Filtro de período na Visão Geral (7/30/90 dias) | não | sim |
| Limpeza automática de conversas antigas (30 dias) | sim | não (roda uma vez por dia, difícil de observar ao vivo) |
| Admin: contas, servidores, eventos | parcial | sim |
| Status de CRM (em aberto/finalizado), independente do status técnico do bot | não | sim |
| Portal do cliente final (`/portal`): login escopado, conceder acesso, métricas | sim (escopo por cliente) | sim (dois perfis, dados isolados por cliente confirmados ao vivo) |
| Caixa de entrada em 3 colunas (equipe e cliente final): busca, abas, responder pelo painel, notas, atualização automática | sim | sim (equipe e cliente, 2026-09-24) |
| Interruptor do bot por conversa + estado explicado (pausado/desligado/motivo) | sim | sim |
| Caixa de entrada com centenas de conversas: filtro por cliente/número, situação única, "carregar mais" | sim | sim (800+ conversas falsas numa cópia do banco, computador e celular, 2026-09-24) |
| Indicadores com gráficos (equipe com filtro por cliente, e cliente final) | sim (números batem com a caixa de entrada e respeitam o escopo) | sim (mesma validação) |
| Banco das conversas no próprio servidor (sem Supabase) | parcial (fallback testado em dev) | não — validar no VPS depois do `git pull` (serviço `dados`) |
| Horários no fuso de Brasília (servidor em UTC) | não | sim |
| Bot não repete o nome da pessoa a cada mensagem | sim (instrução do prompt) | não — só dá para ver com a chave real da OpenAI |
| Modais cobrindo a tela toda (antes cortados dentro da página) | não | sim |
| Instalador do VPS (`infra/provision.sh`) | lógica isolada testada | **sim** — Hostinger (2026-09-24); achou e corrigiu 3 bugs que bloqueavam 100% das instalações (ver abaixo) |
| `render.yaml` (instalação no Render) | validado contra o schema oficial | **sim**, uma vez, ao vivo (custo real medido) |

## O que ainda não existe (backlog consciente, não esquecido)

- **Terminar a Fase 0 no VPS real.** A instalação já rodou na Hostinger;
  falta passar pelo resto de `docs/fase0-checklist.md` com WhatsApp real
  (áudio, imagem, resposta pela caixa de entrada, interruptor do bot, banco
  `dados`). É o próximo passo antes de qualquer divulgação.
- **Termo de uso.** Precisa deixar explícito o que está na tabela de
  responsabilidades acima: software entregue como está, operação é do aluno.
- **Resumo por contato** (ideia do Lorennzo, 2026-09-24). Como as conversas
  somem depois de 30 dias, guardar um resumo curto por contato — o que já
  pediu, comprou, reclamou, preferências — atualizado sozinho quando cada
  conversa termina, e que sobrevive à limpeza. Serve para a equipe (na
  ficha do contato) e para o bot (lembrar o cliente quando ele volta).
  Avaliação: vale a pena, esforço médio, custo de IA desprezível (uma
  chamada do modelo mini por conversa encerrada). Cuidados: não guardar
  dado sensível (em clínica, nada de detalhe de saúde — LGPD), permitir
  editar/apagar, e apagar o resumo de quem não fala há muito tempo (ex.: 12
  meses). A limpeza de hoje apaga o contato junto com a última conversa;
  isso muda. O campo `conversations.summary` já existe e nunca foi usado.
- **Google Agenda** (ideia do Lorennzo, 2026-09-24, pensando em clínicas,
  salões, personal trainers). O bot consultaria horários livres e marcaria
  na agenda do cliente final, em vez de só coletar a preferência e passar
  para a equipe. Avaliação: muito valor de venda para esses nichos, mas é a
  maior peça até agora. O difícil é conectar o Google num produto
  auto-hospedado: o "entrar com Google" (OAuth) exige um app registrado com
  o endereço de cada instalação — ou a Daxus operaria um app central
  (contraria "zero infraestrutura da Daxus"), ou cada aluno configuraria o
  Google Cloud. Caminho preferido, depois da conversa com o Lorennzo (ele
  queria que o próprio cliente autenticasse, como nos conectores tipo MCP):
  **cada aluno registra um app OAuth do Google uma única vez** (tutorial no
  curso, na linha da chave da OpenAI) e, a partir daí, **o próprio cliente
  final clica em "Conectar com Google"** e autoriza a agenda dele — sem o
  aluno no meio. Ressalvas a confirmar quando for construir: a tela do
  Google mostra "app não verificado" até o aluno verificar o app; app não
  verificado tem limite de 100 usuários (sobra para quase todo aluno); o
  app precisa ficar "em produção", não "em teste" (em teste a autorização
  expira em 7 dias); e o Google provavelmente exige domínio próprio no
  endereço de retorno (o sslip.io automático pode não ser aceito).
  Outras formas levantadas, sem nenhum app do Google:
  **link secreto iCal** (o cliente copia o "Endereço secreto no formato
  iCal" da agenda e cola no portal; o bot só LÊ os horários ocupados e
  sugere os livres, e a equipe confirma a marcação — zero configuração do
  aluno, bom primeiro passo; contas Google Workspace podem ter isso
  bloqueado pelo administrador); **Cal.com por chave de API** (o cliente
  conecta o Google dentro do Cal.com, que já tem app verificado, e cola a
  chave no portal; o bot consulta e marca de verdade; depende de mais um
  serviço); **agenda própria dentro da plataforma** (sem Google nenhum, com
  link iCal para o cliente ver no celular; risco de marcação dupla se ele
  também agendar por fora); e a conta de serviço, com o cliente
  compartilhando a agenda com um e-mail. Fases sugeridas: (1) consultar e sugerir
  horários; (2) marcar com confirmação; (3) remarcar/cancelar e lembretes.
  Atalho sem integração, se quiser algo já: o bot manda o link de
  agendamento do cliente (páginas de agendamento do Google Agenda,
  Calendly) quando alguém quer marcar.
- **Caixa de entrada, próximos passos**: respostas rápidas (atalho "/"),
  enviar arquivo/áudio pelo painel, "não lidas", e talvez um tema claro para
  o portal do cliente (o Daxus Pulse, referência do Lorennzo, é claro; o
  painel hoje é só escuro).
- **Kanban de leads (mini-CRM).** Ideia do Lorennzo, explicitamente para uma
  segunda fase. A categorização de conversas e o status aberto/finalizado já
  construídos são a base de dados que esse Kanban vai usar (cada categoria
  vira uma coluna) — não vai precisar de retrabalho de schema quando chegar
  a hora.
- **Canal oficial do WhatsApp (Cloud API da Meta)** como alternativa ao
  Evolution/Baileys, para quem cresce e quer sair da via não oficial.
- **Vídeo de demonstração do Playground** para mostrar o produto a um
  aluno em potencial sem precisar de uma instalação ao vivo (ver seção
  "Quem é o cliente", ponto sobre testar antes de instalar).

## Restrições que não devem ser violadas sem decisão explícita

Estas são decisões deliberadas, não lacunas esquecidas. Qualquer sugestão
futura (de outra IA ou de outra pessoa) que esbarre numa destas deve ser
tratada como uma proposta de mudança de rumo, não como uma correção óbvia:

- **A Daxus nunca opera infraestrutura de produção de um aluno.** Nada de
  voltar a hospedar Evolution ou o painel centralizadamente como caminho
  principal. Ver "Tentativa 1" acima para o motivo.
- **O Evolution nunca fica exposto publicamente**, em nenhum tipo de
  instalação.
- **As conversas do cliente final nunca passam pelo banco de dados da
  Daxus** — sempre na infraestrutura do próprio aluno (o banco do servidor
  dele, ou o Supabase dele, se ele preferir).
- **Nunca usar `window.confirm/prompt/alert`** em nenhuma tela — sempre
  `useDialogs()` (ver `docs/convencoes.md`).
- **`APP_SECRET` nunca deve ser trocado** numa instalação que já tem dados —
  os segredos criptografados (chave da OpenAI, string do Supabase) ficam
  ilegíveis.

## Mapa da documentação

| Arquivo | Conteúdo |
|---|---|
| `CLAUDE.md` | Ponto de entrada rápido para quem (ou qual IA) for mexer no código. |
| `docs/visao-e-decisoes.md` | Este arquivo — a história e o porquê. |
| `docs/arquitetura.md` | Como o sistema é montado tecnicamente, peça por peça. |
| `docs/convencoes.md` | Padrões de código (guards, UI, estrutura de tela). |
| `docs/operacao.md` | Referência técnica do VPS (comandos, rotina, troubleshooting). |
| `docs/instalar-vps.md` | Guia do aluno, sem jargão, para instalar no VPS. |
| `docs/deploy-render.md` | Guia do aluno para instalar via Render (caminho alternativo). |
| `docs/onboarding-aluno.md` | O que o aluno faz depois de instalado (OpenAI, WhatsApp, clientes; o que o dono do negócio precisa saber). |
| `docs/fase0-checklist.md` | Checklist técnico para validar a primeira instalação real. |
| `docs/roadmap.md` | Fases do projeto, o que já foi feito e o que foi descartado. |
