# Contribuindo

## Setup de Desenvolvimento

```bash
git clone git@github.com:davidassef/MyInst.git
cd myinst
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

## Estrutura

- `packages/shared` — Tipos e schemas Zod compartilhados
- `packages/server` — API Fastify
- `packages/mcp-server` — MCP Server (npm package)

## Comandos

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia todos os packages em modo watch |
| `pnpm lint` | Valida tipagem e consistência de compilação em todos os packages |
| `pnpm build` | Compila todos os packages |
| `pnpm test` | Roda todos os testes |
| `pnpm validate` | Executa `lint`, `build` e `test` em sequência |
| `pnpm compose:check` | Valida os arquivos Docker Compose de desenvolvimento e produção |
| `pnpm release:check` | Executa a validação completa do repositório antes do go-live |
| `pnpm db:push` | Aplica schema ao banco |
| `pnpm db:studio` | Abre Drizzle Studio (UI do banco) |

## Workflow

1. Crie uma branch: `git checkout -b feat/minha-feature`
2. Faça suas alterações
3. Rode a validação completa: `pnpm release:check`
4. Commit com Conventional Commits: `git commit -m "feat: adiciona filtro por folder no pull"`
5. Abra um PR

## Convenções

- **Idioma do código:** Lógica de negócio em pt-BR, sintaxe/framework em EN
- **Commits:** Conventional Commits em pt-BR
- **Testes:** Vitest com `app.inject()` para testes de API
- **Validação:** Zod schemas no pacote shared
- **Sem comentários óbvios:** Só comente o "porquê", nunca o "o quê"

## Testes

```bash
# Validação completa
pnpm validate
pnpm compose:check

# Todos os testes
pnpm test

# Apenas server
pnpm --filter @myinst/server test

# Apenas mcp-server
pnpm --filter @myinst/mcp-server test
```

Os testes de API usam `app.inject()` do Fastify e o pacote `@myinst/server`
sobe um Postgres efêmero em Docker durante `pnpm --filter @myinst/server test`.
Isso remove a dependência de um banco local pré-configurado.

## Licença

AGPL-3.0. Ao contribuir, você concorda que suas contribuições serão licenciadas sob a mesma licença.
