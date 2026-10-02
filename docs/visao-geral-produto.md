# Plataforma de chatbots de WhatsApp — visão geral do produto

Documento descritivo: o que o produto é, para quem, o que faz, com que
objetivo, o que está pronto e o que não faz. Sem linguagem de venda.
Estado em 02/10/2026.

---

## 1. O que é

Um painel de atendimento por WhatsApp com inteligência artificial que o
aluno da Daxus instala no próprio servidor. Com ele o aluno conecta números
de WhatsApp de pequenos negócios (clínicas, salões, personal trainers,
pizzarias, lojas, imobiliárias), coloca um bot de IA para responder os
clientes desses negócios e oferece ao dono de cada negócio um acesso próprio
para acompanhar e gerir esse atendimento: conversas, leads, agenda do dia e
números.

É "white label": o nome do produto que aparece nas telas é configurável por
instalação. A Daxus entrega o código e o ensino; não hospeda nem opera nada.

---

## 2. Quem usa (três camadas)

| Camada | Quem é | O que faz no produto |
|---|---|---|
| **Aluno da Daxus** | Quem compra, instala e opera | Instala no servidor dele, cadastra os negócios que atende, conecta os números, configura os bots, acompanha tudo de um painel só. Pode revender esse atendimento. |
| **Cliente do aluno** (o negócio) | Dono da clínica, do salão, o personal | Recebe do aluno um login próprio (portal) e vê só o que é dele: conversas, funil de leads, tela "Hoje" e indicadores. Pode responder pelo próprio painel. |
| **Cliente final** | Quem manda mensagem no WhatsApp | Conversa com o bot (ou com a equipe, quando ela assume). Não vê o painel. |

A Daxus fica fora da operação: mantém e evolui o código e ensina a instalar
e usar.

---

## 3. Como é entregue e quem responde por quê

- **Cada aluno tem a própria instalação**, isolada, no servidor dele. Nada
  passa por servidor da Daxus.
- **Dois jeitos de instalar:**
  - VPS (recomendado): um comando instala tudo (painel, WhatsApp, bancos,
    HTTPS automático). Custo do servidor a partir de ~R$ 30/mês. Testado ao
    vivo na Hostinger.
  - Render (sem terminal): instalação de um clique, mais cara (~US$ 21/mês
    medido ao vivo).
- **IA:** usa a chave OpenAI do próprio aluno, paga por uso (ordem de
  centavos por conversa no modelo mini).
- **Conexão com o WhatsApp:** via Evolution API (conexão "não oficial",
  pelo WhatsApp Web, lendo um QR code ou digitando um código de pareamento).
  Não usa a API oficial da Meta.

| Item | Responsável |
|---|---|
| Código do painel e do bot, evolução do produto | Daxus |
| Servidor, custo de hospedagem, se a instalação está no ar | Aluno |
| Banco de dados das conversas | Aluno (vem pronto no próprio servidor; Supabase dele é opcional) |
| Chave de IA (OpenAI) | Aluno |
| Suporte de "meu servidor caiu" | Aluno (ou o provedor do servidor) — nunca a Daxus |
| Ensinar a instalar e operar | Daxus (curso e guias) |

---

## 4. Objetivos do produto

**Para o aluno**
- Montar um serviço de atendimento com IA para vários negócios e operar
  todos de um painel só, com a marca dele.
- Não depender de plataforma de terceiros cobrando por número ou por
  mensagem: o custo é o servidor e o uso de IA.

**Para o negócio (cliente do aluno)**
- Responder todo mundo na hora, inclusive fora do horário, com informações
  do próprio negócio (preços, serviços, cardápio, endereço).
- Não perder lead: saber quem escreveu, quem está esperando resposta, quem
  esfriou, quem ficou de agendar.
- Assumir a conversa quando precisa, sem conflito com o bot.
- Ter uma camada de gestão: funil do contato até virar cliente, agenda do
  dia, retornos combinados e números do período.

**Para o cliente final**
- Resposta imediata e coerente, que entende texto, áudio e foto, e passa
  para uma pessoa quando ele pede.

---

## 5. Funcionalidades

### 5.1 Painel do aluno (gestão)

- **Visão geral:** checklist de configuração (OpenAI, primeiro cliente,
  primeiro número, bot atribuído), situação dos números (conectado,
  desconectado), atividade dos últimos 7/30/90 dias, eventos recentes.
- **Clientes:** cadastro de cada negócio atendido, com segmento (o segmento
  escolhe o funil pronto do CRM). Concessão de acesso ao portal do dono do
  negócio (link para ele definir a senha), ativar/desativar acesso.
- **Números:** cada número é o WhatsApp de um negócio, sempre ligado a um
  cliente. Conexão por QR code ou código de pareamento. Por número:
  - telefone para receber o aviso de "atendimento humano pedido";
  - quanto tempo o bot pausa quando alguém da equipe responde;
  - quanto tempo esperar a pessoa terminar de digitar antes de responder;
  - depois de quanto tempo sem mensagens a conversa é considerada nova;
  - variáveis usadas nas mensagens do bot (ex.: `{{nome_empresa}}`);
  - ligar/desligar o bot no número inteiro.
- **Bots (Studio):**
  - modelos prontos por nicho: pizzaria, salão, clínica, loja,
    imobiliária e genérico;
  - identidade (nome do assistente, tom, uso de emoji), instruções e regras;
  - informações do negócio: endereço, formas de pagamento, entrega, site;
  - mensagens fixas: saudação, fora do horário, quando não sabe a resposta;
  - horário de funcionamento por dia da semana;
  - ações que o bot pode tomar: chamar atendente, enviar cardápio (imagem
    ou PDF), enviar localização, coletar pedido;
  - categorias de assunto das conversas;
  - ajustes técnicos: modelo, criatividade, tamanho das respostas;
  - **base de conhecimento:** texto livre, perguntas e respostas, arquivo
    PDF ou Word, ou link de site. O bot consulta isso antes de responder;
  - **playground:** conversar com o bot antes de publicar;
  - publicar e duplicar bots.
- **Integrações:** chave da OpenAI; banco de conversas próprio (Supabase)
  como opção avançada.
- **Simulador de WhatsApp** (para testes, só texto).
- **Camada de plataforma** (opcional, para quem administra várias
  instalações/contas): contas, servidores de WhatsApp, eventos e "entrar
  como" uma conta.

### 5.2 O bot (como ele atende)

- Responde em mensagens curtas, separadas, com o "digitando…" do WhatsApp.
- Espera a pessoa terminar de mandar várias mensagens seguidas e responde
  tudo de uma vez.
- Consulta a base de conhecimento do negócio antes de responder.
- **Áudio:** transcreve e responde ao conteúdo.
- **Imagem:** enxerga a foto enviada e responde sobre ela.
- **Horário de funcionamento:** fora do horário avisa uma vez e continua
  atendendo.
- **Pedido de atendente:** quando a pessoa pede um humano (ou fecha algo que
  a equipe precisa confirmar), avisa o dono no WhatsApp, marca a conversa
  como "aguardando" e pausa naquele contato.
- **Pausa quando um humano responde**, pelo celular do número ou pelo
  painel, só naquele contato; volta sozinho depois do tempo configurado.
- Sugere a categoria (assunto) da conversa; uma pessoa confirma.
- Não responde grupos. Evita repetir o nome da pessoa a cada mensagem.
- **Memória:** lê só a conversa atual (uma conversa nova começa após
  algumas horas de silêncio).
- **Não move o funil do CRM** (decisão de produto: o resultado real —
  agendou, compareceu, fechou — acontece fora do WhatsApp).

### 5.3 Caixa de entrada (equipe do aluno e dono do negócio)

- Três colunas: lista de conversas, conversa e ficha do contato.
- Lista feita para centenas de conversas: abas (abertas, aguardando,
  finalizadas, todas), busca por nome/telefone/mensagem, filtros por
  cliente, número e categoria, "carregar mais".
- **Uma situação clara por conversa:** aguardando você · bot atendendo ·
  com a equipe · finalizada.
- **Responder pelo painel**, sem WhatsApp Web: texto, foto, vídeo,
  documento (até 16 MB, inclusive colando print) e áudio gravado no
  navegador (chega como mensagem de voz).
- **Mídias na conversa:** foto em miniatura que amplia, vídeo e áudio com
  player (áudio recebido com a transcrição), documento para baixar.
- **Interruptor do bot por conversa**, sempre com o motivo visível
  ("pausado até 19:45 porque alguém da equipe respondeu", "desligado à
  mão"…).
- Finalizar/reabrir, categoria, notas internas, bloquear contato, renomear.
- **Histórico da pessoa inteiro:** quem volta a conversar aparece uma vez na
  lista, com as conversas anteriores acima e a marca "voltou a conversar
  depois de X dias".
- Respostas pelo celular do número também aparecem no painel ("pelo
  celular").
- Atualiza sozinha a cada poucos segundos.

### 5.4 CRM (funil de leads, por negócio)

- **Lead = a pessoa**, por negócio. Toda pessoa que escreve vira lead
  automaticamente na primeira etapa do funil. Conversas antigas viram leads
  na primeira vez que o funil abre.
- **Funil pronto pelo segmento**, editável pelo negócio e pelo aluno:
  - clínica: Novo → Em atendimento → Ficou de agendar → Agendado →
    Compareceu / Faltou / Perdido;
  - salão/estética: Novo → Em atendimento → Agendado → Atendido / Faltou /
    Perdido;
  - personal/academia: Novo → Em atendimento → Aula experimental →
    Negociando → Fechou / Perdido;
  - delivery/restaurante, loja, imobiliária e serviços com funis próprios.
- **Pessoas movem as etapas:** arrastar o cartão no quadro, ou mudar dentro
  da conversa. Mover para uma etapa de agendamento pede data e hora; mover
  para perda pede o motivo (preço, sem horário, parou de responder…).
- **Sinais automáticos em cada lead:** "aguardando vocês" (a pessoa falou
  por último e ninguém respondeu) e "sem resposta dele há X dias"
  (esfriando com 3, frio com 7).
- **Ficha do lead:** etapa, próxima ação com data, agendamento, interesse,
  valor estimado, notas, origem e linha do tempo (quem mudou o quê e
  quando). Botão para apagar o lead e o histórico a pedido da pessoa
  (LGPD).
- **Tela "Hoje":** agendamentos do dia (com "compareceu" e "faltou" em um
  clique), retornos combinados para hoje ou atrasados, quem está esperando
  resposta e quem esfriou. Número de pendências no menu.
- **Visão em lista** com mudança de etapa de vários leads de uma vez.

### 5.5 Indicadores

- Números do período (7, 30 ou 90 dias): conversas iniciadas (com variação
  sobre o período anterior), em aberto e aguardando agora, finalizadas,
  porcentagem resolvida só pelo bot.
- Gráficos: conversas por dia, assuntos (categorias), horário das mensagens
  (pico do dia) e, para o aluno, conversas por cliente.
- **Funil de vendas:** de quantos chegaram, quantos passaram por cada etapa,
  tempo até agendar (ou fechar), quantos viraram clientes e valor, perdas
  por etapa e por motivo.
- Todo gráfico tem a mesma informação em tabela.

### 5.6 Portal do dono do negócio

- Login próprio, dado pelo aluno. Vê só os números e dados do próprio
  negócio, nunca os de outro cliente do mesmo aluno, nem as configurações do
  painel (bots, integrações).
- Abas: Conversas, Funil, Hoje e Indicadores — as mesmas telas da equipe,
  limitadas ao negócio dele.

### 5.7 Dados, privacidade e segurança

- Conversas, contatos e leads ficam no banco do servidor do aluno.
- Arquivos (fotos, áudios, documentos) não ficam guardados no servidor:
  o painel busca no WhatsApp quando alguém abre a conversa.
- Conversas não são apagadas por padrão; o aluno pode ligar uma limpeza
  automática. Leads e estatísticas não são apagados pela limpeza.
- Isolamento entre negócios garantido no servidor (não só escondido na
  tela) e coberto por testes.
- Chaves e senhas guardadas criptografadas; o servidor do WhatsApp não fica
  exposto na internet.

### 5.8 Instalação e manutenção

- Instalador de um comando para VPS (pergunta nome do negócio, e-mail e
  senha; não pede edição de arquivo).
- HTTPS automático (com domínio próprio ou um endereço gerado).
- Atualização: hoje por um comando no terminal do servidor (o mesmo
  instalador também atualiza).
- Backup dos bancos por script.
- Monitor que confere a saúde dos números e registra eventos (ex.: número
  desconectado).

---

## 6. Estado atual

- **Pronto e coberto por testes automáticos (57):** motor do bot, caixa de
  entrada, envio de mídia, interruptor do bot, CRM, indicadores, isolamento
  entre clientes.
- **Validado ao vivo:** instalação em VPS real (Hostinger); telas testadas
  no navegador com cerca de 800 conversas de teste, como equipe e como
  dono do negócio, no computador e no celular.
- **Falta validar com WhatsApp real** (Fase 0, em andamento): transcrição de
  áudio e visão de imagem com números reais, envio de mídia pelo painel,
  funil com conversas reais, operação contínua por vários dias.
- **Ainda não houve piloto com alunos.**

---

## 7. O que o produto não faz (limites atuais)

- **Não é a API oficial do WhatsApp.** A conexão não oficial tem risco de
  bloqueio do número se usada para disparo em massa ou spam. O produto não
  faz campanhas nem envios em massa. O celular do número precisa se
  conectar à internet pelo menos a cada 14 dias.
- **Não marca horário em agenda externa** (Google Agenda etc.). O bot coleta
  a preferência; a equipe confirma e registra no CRM.
- **O bot não move o funil** nem decide ganho/perda.
- Sem respostas rápidas (atalhos de texto), sem marcação de "não lidas",
  sem vários atendentes com responsável por lead.
- Sem cobrança/pagamentos, sem integração com sistemas de agendamento de
  clínica, sem app de celular (o painel funciona no navegador do celular).
- Atualização ainda é por comando no servidor (não há botão no painel).
- Simulador de testes é só texto; envio de arquivos até 16 MB.
- Painel só em tema escuro.
- A Daxus não dá suporte de servidor; a operação é do aluno.

---

## 8. Próximos passos planejados

- **CRM, fase C:**
  - ao fim de cada conversa, o bot anota sinais com a frase que provou
    ("quer agendar · terça à tarde", "perguntou o preço", "sem interesse")
    e sugere interesse e etapa para uma pessoa aceitar com um clique;
  - resumo por lead, que o bot também lê quando a pessoa volta;
  - mensagens prontas de retorno e lembrete de consulta na véspera.
- **CRM, fase D:**
  - agenda conectada (começando pelo link secreto iCal do Google Agenda,
    só leitura; depois marcação automática);
  - vários atendentes com responsável por lead;
  - reativação automática com limites.
- Antes de divulgar para alunos:
  - termo de uso deixando explícito que instalação e operação são do aluno;
  - atualização com botão no painel;
  - duas versões (teste e estável).
- Depois:
  - alertas quando um número cai e custo estimado por conversa;
  - histórico de versões do bot e importar cardápio a partir de foto/PDF;
  - API oficial da Meta como alternativa e domínio/marca próprios mais
    guiados.

---

## 9. Glossário

- **Número:** um WhatsApp conectado ao painel; pertence a um cliente (negócio).
- **Bot:** a configuração de IA que responde por um ou mais números.
- **Conversa:** o atendimento do momento; uma pessoa que volta depois de
  horas começa uma conversa nova (o histórico continua visível).
- **Lead:** a pessoa ao longo do tempo, dentro do funil de um negócio.
- **Etapa:** a posição do lead no funil (em andamento, ganho ou perda).
- **Portal:** o acesso do dono do negócio, limitado aos dados dele.
- **Evolution API:** o componente que conecta o painel ao WhatsApp
  (conexão não oficial), instalado junto, no servidor do aluno.
