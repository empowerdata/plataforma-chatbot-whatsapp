# Fase 0 — checklist para quando o VPS e o chip chegarem

Objetivo: provar o caminho real de ponta a ponta e medir capacidade. Tudo abaixo já roda em dev com a Evolution simulada; aqui trocamos pela real.

## Preparação

- [ ] VPS Ubuntu com IP público (não precisa de domínio próprio — o
      instalador gera um endereço via sslip.io se faltar um).
- [ ] Chip com WhatsApp ativo num celular (número de teste). Ideal: um segundo celular para fazer o papel do cliente.
- [ ] Chave OpenAI com créditos (pode ser a de dev: `DEV_OPENAI_API_KEY`).
- [ ] (Opcional) Um projeto Supabase de teste, só para validar o caminho "avançado".

## Subir a Evolution real

Primeira rodada: 2026-09-24, Hostinger KVM1 (Ubuntu 24.04 LTS). Achou e
corrigiu três bugs que bloqueavam toda instalação (repositório privado,
`REPO_URL` placeholder, build exigindo segredos) — ver
`docs/visao-e-decisoes.md`.

- [x] `curl -fsSL .../infra/provision.sh | bash` conforme `docs/instalar-vps.md`; responder às perguntas.
- [x] O painel abre em `https://SEU-DOMINIO/login` ao final da instalação.
- [x] Login com o e-mail/senha dados na instalação cai direto no painel (não numa tela de "Admin → Contas" vazia).
- [ ] Depois do `git pull` com o banco `dados`: `docker compose -f infra/docker-compose.yml ps` mostra `dados` como healthy e Integrações → Banco de dados mostra "Ativo" (sem Supabase).
- [ ] Em Admin → Servidores, o servidor Evolution já aparece cadastrado sozinho (cadastro automático via `EVOLUTION_BUNDLED_*`), sem precisar clicar em "Adicionar". "Testar" fica verde.

## Validar a integração (itens marcados "validar" no código)

- [ ] `POST /instance/create` aceita o campo `webhook` aninhado e devolve `hash` como string (v2). Se não, ajustar `http-client.ts`.
- [ ] `POST /webhook/set/{instance}` com o corpo `{ webhook: {...} }` funciona (ou usar corpo plano).
- [ ] QR aparece no painel em até 5 s e se renova; leitura conecta e o status vira "Conectado" (via webhook `connection.update`).
- [ ] Código de pareamento funciona ao criar o número com telefone.
- [ ] Mensagem de texto recebida → resposta do bot em < 10 s, com "digitando" visível no celular.
- [ ] Áudio → transcrito e respondido.
- [ ] Imagem → o bot responde sobre o conteúdo da foto (visão), não só "recebi uma imagem".
- [ ] Dono responde pelo celular → a conversa mostra "Bot pausado… até HH:MM" e o bot fica em silêncio; "Reativar agora" religa na hora.
- [ ] Resposta pela caixa de entrada chega no celular do cliente e aparece com o nome de quem enviou (o eco não vira "pelo celular").
- [ ] Interruptor "Bot" desligado numa conversa → o bot não responde mais aquele contato até religar.
- [ ] "Quero falar com atendente" → aviso chega no telefone configurado e a conversa entra em "Precisa de você".
- [ ] Horários na tela batem com o horário de Brasília (o servidor roda em UTC).
- [ ] Desconectar pelo painel → status "Desconectado"; reconectar gera QR novo.
- [ ] Excluir número remove a instância na Evolution (`fetchInstances` não lista mais).
- [ ] Evolution reiniciada (`docker compose restart evolution`) → instância volta sozinha sem novo QR.

## Banco das conversas

- [ ] Conversas aparecem em **Conversas** lendo do banco do servidor (serviço `dados`), sem configurar nada.
- [ ] Base de conhecimento com embeddings (item "pronto (N trechos)" sem aviso de "sem embeddings").
- [ ] (Opcional) Supabase: colar a string em Integrações → Banco de dados → Avançado: "Conectado", tabelas instaladas (schema `chatbot` no SQL Editor).

## Medições

- [ ] RAM da Evolution com 1, 3 e 5 números (`docker stats`), para calibrar a capacidade por servidor.
- [ ] Latência média webhook → resposta com o modelo mini.
- [ ] Custo de 20 conversas de teste no painel da OpenAI.

## Saída da fase

- Documento curto em `docs/decisoes.md`: o que precisou mudar no cliente HTTP, capacidade medida, latência e custo.
- Ajustar `evolution.env.example` e `http-client.ts` conforme o que foi validado.
