# Instalar sua própria plataforma (servidor próprio, mais barato)

Este é o caminho mais barato: em vez de pagar por vários serviços separados
(como no caminho do Render), tudo roda numa única máquina que custa em torno
de R$ 25 a R$ 30 por mês. Em troca, você vai colar um comando num terminal —
não precisa saber programar, só copiar, colar e responder três perguntas.

Se colar comando em terminal te assusta, use o caminho do Render em
`docs/deploy-render.md` — só clique, um pouco mais caro por mês.

## O que você precisa antes de começar

- Um cartão de crédito, para contratar o servidor.
- Uns 15 minutos, a maior parte é só esperando.

## Passo a passo

1. **Contrate um servidor (VPS)** numa dessas empresas — qualquer uma serve,
   escolha a opção mais barata com Ubuntu:
   - [Hetzner](https://www.hetzner.com/cloud/) — CPX11, em torno de €4/mês.
   - [DigitalOcean](https://www.digitalocean.com/) — Droplet básico, em
     torno de US$ 6/mês.
2. Depois de criar, a empresa mostra um **endereço IP** (uma sequência de
   números, tipo `203.0.113.45`) e te dá um jeito de abrir um terminal
   conectado nele — geralmente um botão "Console" no site deles, ou um
   comando `ssh root@` que eles mesmos mostram prontinho para copiar.
3. **Abra esse terminal** (pelo Console do site, ou colando o comando `ssh`
   que eles deram no Terminal do seu computador).
4. **Cole este comando** e aperte Enter:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/empowerdata/plataforma-chatbot-whatsapp/main/infra/provision.sh | bash
   ```

5. O terminal vai perguntar, em português, nesta ordem:
   - O nome do seu negócio ou agência.
   - O e-mail que você vai usar para entrar no painel.
   - Uma senha (não aparece na tela enquanto digita, é normal).
   - Se você já tem um domínio próprio — se não tiver, só aperte Enter que
     ele gera um endereço automático que já funciona.
6. Espera. A primeira instalação demora de cinco a dez minutos.
7. No final, aparece o endereço do seu painel (algo como
   `https://203-0-113-45.sslip.io`). Abra esse link.
8. **Entre com o e-mail e a senha que você digitou no passo 5.**

Pronto — você caiu direto no seu painel.

## Depois de entrar

Segue o checklist que aparece na primeira tela: conectar a OpenAI (custa
centavos por conversa), ler o QR code do primeiro WhatsApp, escolher um bot
pronto. Tudo isso o próprio painel guia, com o passo a passo embutido em cada
tela. O banco de dados das conversas já vem pronto dentro do seu servidor —
não precisa criar conta em lugar nenhum.

## Perguntas comuns

**Isso é da Daxus?** Não. O servidor é seu, contratado com seu cartão. A
Daxus vendeu o produto pronto para você instalar, quem opera é você.

**Quanto custa por mês?** Só o servidor, em torno de R$ 25 a R$ 30 (cobrado
pela empresa do VPS, não pela Daxus). Fora isso, só a OpenAI, que cobra pelo
uso: centavos por conversa.

**Qual sistema escolho na empresa do VPS?** Ubuntu 24.04 LTS (validado na
Hostinger). Se oferecerem um "gerenciador de Docker" ou "painel de
aplicativos", pode deixar desmarcado — o instalador já cuida do Docker.

**Se eu rodar o comando de novo, quebra alguma coisa?** Não. Ele percebe que
já existe uma instalação e pergunta se você quer só reiniciar/atualizar.

**Travei em algum passo.** Tire um print da mensagem e mande para quem te
passou este guia. Problemas do servidor em si (não conseguir criar a conta,
cartão recusado) são com o suporte da empresa do VPS, não da Daxus.

---

*Nota técnica (não faz parte do material do aluno): o script
`infra/provision.sh` foi revisado e teve sua sintaxe e lógica de perguntas
testadas isoladamente nesta sessão, mas ainda precisa de uma instalação
real, de ponta a ponta num VPS, antes de gravar o vídeo e divulgar.*
