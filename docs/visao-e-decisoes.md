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
   um chatbot no WhatsApp dele. Não acessa o painel, não tem login. Hoje só
   interage via WhatsApp; um portal para esse cliente ver os próprios dados é
   ideia de fase futura (ver "O que ainda não existe").
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
| Banco de dados das conversas (Supabase) | Aluno (conta própria, gratuita para o volume inicial) |
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
seus próprios números e bots, todos no mesmo Supabase da conta. Não existe
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
2. Todo serviço do portal (`src/server/services/portal.ts`) filtra
   explicitamente por `client_id`, nunca só por `account_id` — segue o mesmo
   princípio já documentado para as queries do aluno na plataforma de cursos:
   confiar só em RLS ou só em esconder a UI não basta, o filtro tem que estar
   explícito em cada consulta. Um cliente não pode ver a conversa de outro
   cliente mesmo adivinhando um id de conversa.

O portal mostra hoje: conversas (lidas, não respondidas — sem caixa de
resposta), categoria (o bot categoriza, o cliente pode corrigir) e um status
leve de CRM — "em aberto" / "finalizada" (`conversations.resolved_at`,
separado do `status` técnico que controla o bot, porque uma conversa pode
fechar tecnicamente por timeout e continuar em aberto como lead). "Em aberto"
nunca é filtrado por período — um lead de 40 dias atrás não pode sumir
sozinho da lista; só a contagem de "finalizadas" é por período, como métrica.

### O Evolution (WhatsApp) nunca fica público

Tanto no VPS quanto no Render, o servidor Evolution API não tem domínio nem
porta pública — só o painel consegue falar com ele, pela rede interna do
Docker. Ninguém de fora, nem o próprio aluno, acessa a API do Evolution
diretamente. Isso reduz a superfície de ataque e simplifica a instalação (um
domínio a menos para configurar).

### Dados do aluno ficam no banco do aluno, não no nosso

Existem dois bancos de dados por instalação: um "plano de controle" (contas,
números, bots — dados operacionais do painel) e um "plano de dados" no
Supabase do próprio aluno (conversas, contatos, base de conhecimento
vetorizada). Essa separação existe desde a Tentativa 1 e continua válida: a
Daxus (e, no modelo atual, nem o próprio código da Daxus hospedado em algum
lugar central) nunca vê o conteúdo das conversas do cliente final. É um
argumento de privacidade real, não só discurso.

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
infraestrutura nova). A imagem em si **nunca é gravada no Supabase do
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
apagadas automaticamente no Supabase do aluno. As estatísticas agregadas
(quantas conversas, quantas mensagens por dia) não são apagadas — o gráfico
da Visão Geral continua funcionando. Motivo: não faz sentido guardar o
histórico de conversa do cliente final indefinidamente, nem do ponto de
vista de custo, nem de privacidade.

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
| Portal do cliente final (`/portal`): login escopado, conceder acesso, categorizar, finalizar/reabrir, métricas | não | sim (dois perfis, dados isolados por cliente confirmados ao vivo) |
| Instalador do VPS (`infra/provision.sh`) | lógica isolada testada | **não** — precisa de um VPS real |
| `render.yaml` (instalação no Render) | validado contra o schema oficial | **sim**, uma vez, ao vivo (custo real medido) |

## O que ainda não existe (backlog consciente, não esquecido)

- **Teste de instalação real num VPS de ponta a ponta.** Este ambiente de
  desenvolvimento não tem Docker, então o instalador nunca rodou de verdade
  fora de testes isolados de lógica. É o próximo passo mais importante antes
  de qualquer divulgação.
- **Termo de uso.** Precisa deixar explícito o que está na tabela de
  responsabilidades acima: software entregue como está, operação é do aluno.
- **Inbox com resposta humana pela plataforma**, incluindo dar essa mesma
  caixa de resposta ao cliente final no portal (hoje ele só categoriza e
  finaliza; para responder, ainda precisa do WhatsApp de verdade). A função
  de enviar mensagem via Evolution já existe, reaproveitada do bot — falta a
  UI e a tela atualizar sozinha (polling simples).
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
  Daxus** — sempre no Supabase do próprio aluno.
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
| `docs/onboarding-aluno.md` | O que o aluno faz depois de instalado (conectar Supabase, OpenAI, WhatsApp). |
| `docs/fase0-checklist.md` | Checklist técnico para validar a primeira instalação real. |
| `docs/roadmap.md` | Fases do projeto, o que já foi feito e o que foi descartado. |
