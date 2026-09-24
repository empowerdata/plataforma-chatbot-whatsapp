# Instalar sua própria plataforma (Render, um clique)

Este é o caminho mais simples: você cria sua conta na Render (empresa de
hospedagem, não tem nada a ver com a Daxus), clica em um botão, preenche um
formulário curto e em alguns minutos tem seu próprio painel no ar, com seu
próprio WhatsApp, seu próprio banco de dados e sua própria conta na OpenAI —
tudo seu, a Daxus não hospeda nem opera nada disso.

## O que você precisa antes de começar

- Um e-mail.
- Um cartão de crédito. A Render pede para confirmar que você não é um robô,
  mesmo no período de teste — é normal, você não é cobrado sem avisar antes.
- Uns 10 minutos.

## Passo a passo

1. **Clique no botão de instalação** que você recebeu da Daxus.
2. **Crie sua conta na Render** (pode ser com o Google, para ir mais rápido).
3. **Preencha o formulário curto** que aparece: o nome do seu negócio, o
   e-mail e a senha que você vai usar para entrar no seu painel depois. Não
   precisa preencher mais nada — o resto a Render configura sozinha.
4. **Clique em Deploy (ou "Apply")** e espere. Isso demora de três a cinco
   minutos. A tela vai mostrar um monte de coisa técnica passando — pode
   ignorar, é normal, só espere terminar.
5. Quando terminar, a Render mostra o link do seu painel (algo como
   `https://painel-xxxx.onrender.com`). Abra esse link.
6. **Entre com o e-mail e a senha que você escolheu no passo 3.**

Pronto — você caiu direto no seu painel, já com o seu próprio WhatsApp
pronto para conectar.

## Depois de entrar

A primeira tela mostra um checklist. Siga ele nesta ordem:

1. **Conectar a OpenAI** — é a inteligência do bot. Custa centavos por
   conversa, sem mensalidade. O painel guia (Integrações → OpenAI).
2. **Adicionar seu primeiro número de WhatsApp** — aparece um QR code, é só
   ler com o WhatsApp do celular, igual ao WhatsApp Web.
3. **Criar seu primeiro bot** — escolha um modelo pronto (pizzaria, salão,
   clínica...) e em poucos minutos já está atendendo.

O banco de dados das conversas já vem pronto (é o mesmo banco que o Render
criou para o painel) — não precisa criar conta no Supabase nem em lugar
nenhum.

## Perguntas comuns

**Isso é da Daxus?** Não. O painel, o WhatsApp e o banco de dados rodam na
sua conta da Render, com seu cartão. A Daxus vendeu o produto pronto para
você instalar, mas quem opera é você.

**Quanto custa por mês?** A Render cobra pelos serviços que ficam ligados
(o painel e o WhatsApp precisam ficar sempre ligados para responder na
hora). Contando tudo, fica em torno de quarenta a sessenta reais por mês,
cobrado direto no seu cartão pela Render.

**Se a Daxus sumir amanhã, eu perco tudo?** Não. Sua instalação continua no
ar normalmente, porque não depende de nada da Daxus rodando.

**Posso ter mais de um número de WhatsApp?** Sim, quantos quiser, direto no
painel, sem precisar instalar nada de novo.

**Travei em algum passo.** Isso aqui é uma instalação de software de
verdade — se travar em algum ponto específico da Render (não do painel em
si), o suporte da própria Render pode ajudar. A Daxus não acompanha nem
opera sua instalação.

---

*Nota técnica (não faz parte do material do aluno): este guia descreve o
fluxo esperado com base no `render.yaml` deste repositório e na documentação
oficial da Render. O arquivo já passou na validação oficial do schema da
Render, mas ainda precisa de uma instalação real, de ponta a ponta, para
confirmar o texto exato das telas antes de gravar o vídeo e divulgar para
alunos.*
