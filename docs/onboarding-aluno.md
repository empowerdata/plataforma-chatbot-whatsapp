# O que o aluno faz depois de instalar (uns 10 minutos, uma vez)

## 1. Entrar

No fim da instalação (`docs/instalar-vps.md` ou `docs/deploy-render.md`) aparece o endereço do painel. Entra com o e-mail e a senha que digitou durante a instalação — cai direto no painel do próprio negócio.

O banco de dados das conversas **já vem pronto** no servidor: não precisa criar nem conectar nada. (Quem quiser guardar as conversas num Supabase próprio encontra essa opção em **Integrações → Banco de dados → Avançado**. É opcional.)

## 2. Conectar a OpenAI (3 min, uma vez)

1. platform.openai.com → Billing → adicionar créditos (US$ 5 bastam para começar).
2. API keys → Create new secret key → copiar.
3. Colar em **Integrações → OpenAI → Salvar e testar**. Escolher o modelo (padrão: GPT-5.4 mini).

## 3. Para cada cliente (pizzaria, salão…)

1. **Clientes → Adicionar cliente**: nome do negócio e contato.
2. **Bots → Novo bot**: escolher o modelo do nicho, informar o nome do negócio. No Studio: revisar instruções, colar cardápio/lista de serviços em **Conhecimento** (texto, PDF ou link), testar no playground, **Publicar**.
3. **Números → Adicionar número**: dar um nome e escolher o cliente. Aparece o QR code.
4. No celular do cliente: WhatsApp → Dispositivos conectados → Conectar dispositivo → ler o QR. Ou, se informou o telefone, digitar o código de pareamento.
5. Na tela do número: atribuir o bot, colocar o telefone do dono em "Aviso de atendimento humano".
6. Mandar uma mensagem de teste para o número e ver a resposta em **Conversas**.
7. Opcional: em **Clientes**, dar ao dono do negócio o acesso ao portal dele (link para definir senha).

## O que o dono do negócio precisa saber

- Tudo aparece em **Conversas** (ou no portal dele): responde de lá mesmo, sem precisar do WhatsApp Web.
- Cada conversa tem um interruptor **Bot**: ligado, o bot responde sozinho; desligado, só a equipe responde. Quando alguém da equipe responde (pelo painel ou pelo celular), o bot pausa naquela conversa por algumas horas e volta sozinho — ou na hora, pelo "Reativar agora".
- Quando o cliente pede uma pessoa (ou fecha um pedido que a equipe precisa confirmar), a conversa entra em **Precisa de você** e o dono é avisado no WhatsApp.
- **Finalizar** tira a conversa da lista de abertas; categorias e notas internas ajudam a organizar os atendimentos.
- O celular precisa entrar na internet pelo menos a cada 14 dias, senão o WhatsApp derruba a conexão (aí é só ler o QR de novo).
