# Plataforma de chatbots WhatsApp (white label)

Painel multi-conta onde alunos gerenciam números de WhatsApp com bots de IA para pequenos negócios. A Evolution API é hospedada pela plataforma; cada aluno usa o **próprio Supabase** (conversas) e a **própria chave OpenAI** (inteligência).

## Rodar em desenvolvimento (sem instalar nada além do Node)

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Não precisa de Docker, Postgres nem Supabase: em dev o banco é embutido (PGlite em `./.data`) e a Evolution é simulada.

| Acesso | E-mail | Senha |
|---|---|---|
| Administrador da plataforma | `admin@local.test` | `admin123` |
| Aluno de demonstração | `demo@local.test` | `demo123` |

A conta demo já vem com dois clientes, dois bots, um número "conectado" e algumas conversas. Use **Simulador** no menu para conversar com o bot como se fosse um cliente no WhatsApp.

Para respostas de IA de verdade em dev, coloque `DEV_OPENAI_API_KEY=sk-...` num arquivo `.env.local` (ou configure a chave em Integrações).

## Comandos

```bash
npm run dev        # desenvolvimento
npm test           # testes (unitários, banco do aluno, ponta a ponta)
npx tsc --noEmit   # tipos
npm run build      # build de produção
npx drizzle-kit generate   # gerar migration após mudar src/server/db/schema.ts
```

## Documentação

- `docs/arquitetura.md` — peças, fluxo da mensagem, decisões.
- `docs/convencoes.md` — como escrever telas e código aqui.
- `docs/operacao.md` — subir e manter o servidor (VPS, Docker, backups).
- `docs/onboarding-aluno.md` — o que o aluno faz, passo a passo.
- `docs/fase0-checklist.md` — o que validar quando o VPS e o chip chegarem.
- `docs/roadmap.md` — fases.

## Produção

`infra/docker-compose.yml` sobe tudo num VPS: Evolution API, Postgres, Redis, painel e Caddy (HTTPS automático). Passo a passo em `docs/operacao.md`.
