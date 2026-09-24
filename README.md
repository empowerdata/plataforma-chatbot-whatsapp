# Plataforma de chatbots WhatsApp (white label, self-hosted pelo aluno)

Kit que um aluno da Daxus instala no **próprio servidor** para gerenciar números de WhatsApp com bots de IA para pequenos negócios. Cada instalação é isolada: as conversas ficam no **banco do próprio servidor** (ou num Supabase do aluno, opcional), a IA usa a **própria chave OpenAI** e o Evolution API vem junto — a Daxus não hospeda nem opera nada disso. A equipe do aluno e o cliente final atendem pela mesma caixa de entrada (`/conversas` e `/portal/conversas`). Ver `docs/visao-e-decisoes.md` para o porquê deste modelo.

## Rodar em desenvolvimento (sem instalar nada além do Node)

```bash
npm install
npm run dev
```

Abra http://localhost:3000 (ou a porta que usar com `npm run dev -- -p 3100`; o Simulador funciona em qualquer porta). Não precisa de Docker, Postgres nem Supabase: em dev o banco é embutido (PGlite em `./.data`) e a Evolution é simulada.

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

- `docs/visao-e-decisoes.md` — **leia primeiro**: modelo de negócio, o histórico de decisões e o porquê, restrições que não devem ser violadas.
- `docs/arquitetura.md` — peças técnicas, fluxo da mensagem.
- `docs/convencoes.md` — como escrever telas e código aqui.
- `docs/operacao.md` — subir e manter o servidor (VPS, Docker, backups).
- `docs/instalar-vps.md` / `docs/deploy-render.md` — guias de instalação para o aluno (sem jargão técnico).
- `docs/onboarding-aluno.md` — o que o aluno faz depois de instalado, passo a passo.
- `docs/fase0-checklist.md` — o que validar quando o VPS e o chip chegarem.
- `docs/roadmap.md` — fases do projeto.

## Produção

Cada aluno instala a própria cópia. Dois caminhos, nenhum operado pela Daxus:

- **VPS (recomendado, mais barato)**: `infra/provision.sh` — um comando, sobe tudo (Evolution API, Postgres, Redis, painel, Caddy com HTTPS automático). Guia: `docs/instalar-vps.md`.
- **Render (sem terminal, mais caro)**: `render.yaml` — instalação de um clique. Guia: `docs/deploy-render.md`.
