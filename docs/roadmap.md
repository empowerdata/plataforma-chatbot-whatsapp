# Roadmap

## Feito (base construída em 21/09/2026, sem VPS)

- Painel completo: login, contas (super admin), servidores, eventos, clientes, números com QR/pareamento, bots com Studio + base de conhecimento + playground, conversas, integrações (Supabase e OpenAI), configurações, simulador de WhatsApp para dev.
- Engine: debounce por contato, RAG com pgvector (ou busca textual sem chave), ferramentas (atendente humano, cardápio, localização), pausa quando humano responde, horário de funcionamento, transcrição de áudio, estatísticas diárias.
- Infra: Docker Compose (Evolution + Postgres + Redis + painel + Caddy), scripts de provisionamento e backup.
- Testes: unitários, banco do aluno (mesmo SQL do Supabase) e ponta a ponta com Evolution simulada.

## Fase 0 — prova real (1 semana, precisa de VPS + chip)

Ver `docs/fase0-checklist.md`.

## Fase 1 — MVP com alunos-piloto (3–4 semanas)

- Ajustes do que a Fase 0 revelar no cliente HTTP da Evolution.
- E-mail transacional (link de senha, aviso de número caído): Resend.
- Página pública "status do número" para o aluno mandar ao dono? (opcional)
- Termos de uso (aluno) e modelo de contrato aluno → cliente final.
- Piloto com 2–3 alunos, 1 cliente cada. Coletar: tempo de onboarding, dúvidas, qualidade das respostas.

## Fase 2 — qualidade (3 semanas)

- Imagens com visão (o bot entende a foto).
- Resumo automático da conversa (campo `summary`) e classificação de assunto para estatísticas.
- Custo estimado por conversa/número no painel (tokens × preço do modelo).
- Alertas por e-mail/WhatsApp quando um número cai (hoje só evento no painel).
- Fila com Redis (BullMQ) para rodar mais de uma réplica do painel.
- Versões do bot com histórico e "voltar para versão".
- Importar cardápio de foto/PDF com extração estruturada.

## Fase 3 — produto (contínuo)

- Inbox com resposta humana pela plataforma (hoje o dono responde pelo celular).
- Portal do cliente final (a pizzaria vê as conversas dela).
- Domínio e marca por conta (white label completo).
- Canal oficial (Meta Cloud API) via Evolution `WHATSAPP-BUSINESS`.
- Cobrança por número extra (Stripe/Asaas) e limite automático.
- Evolution hospedada com auto-escala (mais de um servidor gerenciado automaticamente).
