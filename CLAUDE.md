# Plataforma de chatbots WhatsApp (white label)

Painel multi-conta onde alunos gerenciam números de WhatsApp (Evolution API hospedada por nós) com bots de IA (OpenAI do aluno) e dados no Supabase do aluno.

- **Leia `docs/convencoes.md` antes de criar telas.** Padrão CRUD, guards, tokens de cor, "nunca diálogos nativos".
- Arquitetura e decisões: `docs/arquitetura.md`. Operação do servidor Evolution: `docs/operacao.md`.
- Dev: `npm run dev` (Postgres embutido em `./.data`, Evolution simulada, login `admin@local.test`/`admin123` ou `demo@local.test`/`demo123`).
- Antes de dizer pronto: `npx tsc --noEmit`, `npm run build`, testar no navegador.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
