# Plataforma de chatbots WhatsApp (white label, self-hosted pelo aluno)

Kit que um aluno da Daxus instala no **próprio servidor** para gerenciar
chatbots de IA em números de WhatsApp e revender esse atendimento a pequenos
negócios. A Daxus vende e mantém o produto; quem hospeda, opera e paga a
infraestrutura é o aluno — a Daxus não tem nenhuma responsabilidade
operacional sobre a instalação de ninguém. Isso não é um detalhe, é a
decisão de negócio que molda toda a arquitetura.

**Leia `docs/visao-e-decisoes.md` antes de propor qualquer mudança de
arquitetura ou de modelo de negócio.** Ele explica o histórico completo:
o que já foi tentado, o que foi descartado e por quê, e as restrições que
não devem ser violadas sem uma decisão explícita e consciente.

## Para começar a mexer no código

- **Leia `docs/convencoes.md` antes de criar telas.** Padrão CRUD, guards, tokens de cor, "nunca diálogos nativos".
- Arquitetura técnica: `docs/arquitetura.md`. Operação do VPS: `docs/operacao.md`.
- Dev: `npm run dev` (Postgres embutido em `./.data`, Evolution simulada, login `admin@local.test`/`admin123` ou `demo@local.test`/`demo123`).
- Antes de dizer pronto: `npx tsc --noEmit`, `npm test`, `npm run build`, testar no navegador.
- Mapa completo da documentação: final de `docs/visao-e-decisoes.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
