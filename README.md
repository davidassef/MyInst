# MyInst

MyInst e um vault open source para armazenar, versionar e sincronizar instrucoes
de IA entre projetos, dispositivos e clientes MCP.

Com ele voce consegue manter `skills`, `instructions`, `agents`, `hooks`,
`memory`, `snippets` e configuracoes MCP em um backend central, com interface web,
CLI e MCP server local para distribuicao automatica.

## Problema Que Resolve

Quem trabalha com agentes de codigo normalmente espalha configuracoes em:

- `.claude/`
- `AGENTS.md`
- `.mcp.json`
- snippets locais
- promps e regras copiadas entre maquinas

Isso rapidamente vira duplicacao, divergencia de versao e perda de contexto.

O MyInst resolve isso oferecendo:

- backend central para armazenar conteudo agentic
- versionamento de conteudo
- organizacao por projetos e folders
- tags por modelo/provider
- distribuicao local via MCP server
- CLI para sync fora do fluxo MCP

Nao e marketplace. O foco e ser um cofre pessoal e controlado pelo usuario.

## Principais Recursos

- Cadastro, login e gerenciamento de API Keys
- CRUD de projetos, folders e conteudos
- Tipos suportados: `skill`, `instruction`, `mcp_config`, `agent`, `hook`, `memory`, `snippet`
- Versionamento com diff e restore
- Busca full-text no backend
- Perfis por modelo com selecao automatica de tags
- MCP server local com tools de `pull`, `push`, `search`, `status`, `import`
- CLI standalone para `login`, `pull`, `push` e `list`
- Deploy self-hosted com Docker Compose

## Como Funciona

1. O usuario cria conta e gera uma API key.
2. O conteudo fica salvo no servidor MyInst.
3. O MCP server local autentica com essa API key.
4. O cliente MCP ou a CLI puxam o conteudo e aplicam os arquivos no projeto local.
5. Alteracoes futuras podem ser reenviadas para o vault com versionamento.

## Arquitetura

O monorepo esta dividido em cinco pacotes:

- `packages/server`
  API Fastify com auth, sync, busca, versionamento e persistencia
- `packages/web`
  Aplicacao React para gerenciamento do vault
- `packages/mcp-server`
  Servidor MCP local que conecta o usuario ao backend MyInst
- `packages/cli`
  CLI para autenticacao e sincronizacao sem depender de um cliente MCP
- `packages/shared`
  Schemas Zod, tipos e constantes compartilhadas

## Stack

- Linguagem: TypeScript
- Backend: Fastify
- Frontend: React 19 + Vite
- Banco: PostgreSQL + Drizzle ORM
- Validacao: Zod
- Auth: JWT + API Keys + OAuth Google/GitHub
- Monorepo: pnpm workspaces + Turborepo
- Testes: Vitest
- MCP: `@modelcontextprotocol/sdk`

## Estrutura do Repositorio

```text
MyInst/
├── packages/
│   ├── cli/
│   ├── mcp-server/
│   ├── server/
│   ├── shared/
│   └── web/
├── deploy/
├── docs/
├── docker-compose.yml
├── docker-compose.vps.yml
└── README.md
```

## Quick Start

### Requisitos

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+
- Docker Desktop, se quiser validar compose e testes do server com Postgres efemero

### Instalacao local

```bash
git clone git@github.com:davidassef/MyInst.git
cd MyInst
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

Aplicacoes locais:

- API: `http://localhost:3000`
- Frontend Vite: `http://localhost:5173`

## Variaveis de Ambiente

Arquivo base: [`.env.example`](.env.example)

Principais variaveis:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `NODE_ENV`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
  - `OAUTH_CALLBACK_URL`
  - `VITE_MYINST_API_BASE`

## Comandos Importantes

```bash
pnpm dev
pnpm lint
pnpm build
pnpm test
pnpm validate
pnpm compose:check
pnpm release:check
```

### O que cada um faz

- `pnpm validate`
  roda `lint`, `build` e `test`
- `pnpm compose:check`
  valida os arquivos Docker Compose de dev, VPS e shared-infra
- `pnpm release:check`
  roda a validacao completa antes de publicacao ou deploy

## Uso do MCP Server

Instalacao:

```bash
npm install -g @myinst/mcp-server
```

O binario exposto e `myinst-mcp`.

Exemplo de configuracao para clientes MCP:

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_API_KEY": "myinst_sua_key_aqui",
        "MYINST_SERVER": "http://localhost:3000"
      }
    }
  }
}
```

Tools disponiveis hoje:

- `myinst_list_projects`
- `myinst_pull`
- `myinst_search`
- `myinst_status`
- `myinst_push`
- `myinst_import`

Documentacao completa em [docs/mcp-server.md](docs/mcp-server.md).

## Uso da CLI

Instalacao:

```bash
npm install -g @myinst/cli
```

Comandos principais:

```bash
myinst login
myinst list default
myinst pull default
myinst push default
```

## Qualidade e CI

O projeto possui:

- checagem de tipagem por pacote
- build completo do monorepo
- testes automatizados do CLI, MCP server e API
- pipeline CI em GitHub Actions

Arquivos relevantes:

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- [docs/contribuindo.md](docs/contribuindo.md)

## Deploy

Modos suportados:

- Docker Compose local: [docker-compose.yml](docker-compose.yml)
- VPS para API + shared-infra: [deploy/docker-compose.vps-api.yml](deploy/docker-compose.vps-api.yml) e [deploy/docker-compose.shared-infra.yml](deploy/docker-compose.shared-infra.yml)
- Alternativa de stack completa no VPS (inclui nginx do web): [docker-compose.vps.yml](docker-compose.vps.yml)
- Infra compartilhada versionada: [deploy/docker-compose.shared-infra.yml](deploy/docker-compose.shared-infra.yml)

Documentacao:

- [docs/self-hosting.md](docs/self-hosting.md)
- [docs/go-live-checklist.md](docs/go-live-checklist.md)
- [deploy/MIGRACAO.md](deploy/MIGRACAO.md)

## Publicacao npm

Os pacotes preparados para publicacao sao:

- `@myinst/shared`
- `@myinst/mcp-server`
- `@myinst/cli`

Fluxo documentado em [docs/publicacao-npm.md](docs/publicacao-npm.md).

## Roadmap Imediato

- Publicacao real dos pacotes no npm
- Deploy em VPS com dominio proprio
- Configuracao de OAuth real
- Smoke test em ambiente publicado

## Documentacao

- [Arquitetura](docs/arquitetura.md)
- [API Reference](docs/api.md)
- [MCP Server](docs/mcp-server.md)
- [Go-Live Checklist](docs/go-live-checklist.md)
- [Self-Hosting](docs/self-hosting.md)
- [Publicacao npm](docs/publicacao-npm.md)
- [Contribuindo](docs/contribuindo.md)

## Contribuicao

Pull requests sao bem-vindos, mas o padrao do projeto e estrito:

- logica de negocio em pt-BR
- Conventional Commits em pt-BR
- foco em legibilidade e manutenibilidade
- nada de DDL executado sem permissao explicita

Leia [docs/contribuindo.md](docs/contribuindo.md) antes de contribuir.

## Licenca

Este projeto esta licenciado sob AGPL-3.0.

Veja [LICENSE](LICENSE) para os termos completos.
