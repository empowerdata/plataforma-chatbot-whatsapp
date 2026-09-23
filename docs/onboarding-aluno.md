# O que o aluno faz (fricção total: ~10 minutos, uma vez)

## 1. Receber o acesso

O administrador cria a conta e manda um link "definir senha" (vale 7 dias). O aluno cria a senha e entra.

## 2. Conectar o Supabase (5 min, uma vez)

Por que: as conversas dos clientes dele ficam no banco **dele**, de graça.

1. Criar conta em supabase.com → New project (guardar a senha do banco).
2. No projeto: botão **Connect** → aba **Session pooler** → copiar a URI.
3. Trocar `[YOUR-PASSWORD]` pela senha do banco.
4. Colar em **Integrações → Supabase → Conectar e instalar**. A plataforma cria as tabelas sozinha.

## 3. Conectar a OpenAI (3 min, uma vez)

1. platform.openai.com → Billing → adicionar créditos (US$ 5 bastam para começar).
2. API keys → Create new secret key → copiar.
3. Colar em **Integrações → OpenAI → Salvar e testar**. Escolher o modelo (padrão: GPT-5.4 mini).

## 4. Para cada cliente (pizzaria, salão…)

1. **Clientes → Novo**: nome do negócio e contato.
2. **Bots → Novo bot**: escolher o modelo do nicho, informar o nome do negócio. No Studio: revisar instruções, colar cardápio/lista de serviços em **Conhecimento** (texto, PDF ou link), testar no playground, **Publicar**.
3. **Números → Adicionar número**: dar um nome e escolher o cliente. Aparece o QR code.
4. No celular do cliente: WhatsApp → Dispositivos conectados → Conectar dispositivo → ler o QR. Ou, se informou o telefone, digitar o código de pareamento.
5. Na tela do número: atribuir o bot, colocar o telefone do dono em "Aviso de atendimento humano".
6. Mandar uma mensagem de teste para o número e ver a resposta.

## O que o dono do negócio precisa saber

- Pode responder normalmente pelo celular: quando ele responde, o bot fica em silêncio com aquele cliente por algumas horas.
- Quando o bot não consegue resolver ou o cliente pede uma pessoa, ele avisa o dono no WhatsApp.
- O celular precisa entrar na internet pelo menos a cada 14 dias, senão o WhatsApp derruba a conexão (aí é só ler o QR de novo).
