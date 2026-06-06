# Arquitetura

## Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                    Máquina do Usuário                         │
│                                                              │
│  ┌──────────────┐   stdio   ┌───────────────────────────┐   │
│  │ Claude Code  │◄─────────►│ @myinst/mcp-server        │   │
│  │ / Cursor     │           │ (Node.js, local)          │   │
│  │ / VS Code    │           │                           │   │
│  └──────────────┘           │ Auth via API Key          │   │
│                             │ Pull/Push configs         │   │
│                             │ Aplica ao projeto local   │   │
│                             └─────────────┬─────────────┘   │
└───────────────────────────────────────────┼─────────────────┘
                                            │ HTTPS
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 MyInst Server                                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              API (Fastify)                              │ │
│  │  /api/v1/auth/*     → Registro, login, API keys       │ │
│  │  /api/v1/projects/* → CRUD projetos/folders/content   │ │
│  │  /api/v1/sync/*     → Pull/push otimizado para MCP    │ │
│  │  /api/v1/tags/*     → Tags de modelo/provider         │ │
│  └───────────────────────────┬────────────────────────────┘ │
│                              │                               │
│  ┌───────────────────────────▼────────────────────────────┐ │
│  │                    PostgreSQL                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Stack

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| MCP Server | TypeScript / Node.js | MCP SDK é nativo TS |
| Backend API | TypeScript / Fastify | Tipos compartilhados com MCP server |
| Banco | PostgreSQL | Relacional, JSONB, full-text search |
| ORM | Drizzle ORM | Type-safe, migrations simples |
| Validação | Zod | Compartilhado entre API e MCP server |
| Monorepo | pnpm workspaces + Turborepo | Builds rápidos |

## Estrutura do Monorepo

```
myinst/
├── backend/             ← API Fastify
│   ├── src/
│   │   ├── routes/      (auth, projects, content, sync, tags)
│   │   ├── db/          (schema Drizzle)
│   │   └── middleware/
│   └── tests/
├── frontend/            ← App React (Vercel)
├── packages/
│   ├── mcp-server/      ← MCP Server (npm package)
│   │   ├── src/
│   │   │   ├── tools/   (pull, push, search, status)
│   │   │   ├── client/  (HTTP client para API)
│   │   │   └── applier/ (escreve configs no disco)
│   │   └── tests/
│   └── shared/          ← Tipos e schemas compartilhados
│       └── src/
│           ├── schemas/ (Zod schemas)
│           ├── types/
│           └── constants.ts
├── docs/
├── docker-compose.yml
└── .env
```

## Modelo de Dados

### Entidades

- **User** → Conta do usuário
- **ApiKey** → Chaves de autenticação para MCP
- **Project** → Agrupamento de conteúdo (cada user tem um "default")
- **Folder** → Subpastas dentro de projetos
- **ContentItem** → Skills, instructions, configs, agents, hooks, memory
- **Tag** → Labels de modelo/provider para filtrar no pull
- **ContentVersion** → Histórico de versões anteriores

### Relacionamentos

```
User (1) ──► (N) Project (1) ──► (N) Folder
                    │
                    └──► (N) ContentItem (1) ──► (N) ContentVersion
                                   │
                                   └──► (N) Tag (via junction)
User (1) ──► (N) ApiKey
User (1) ──► (N) Tag
```

## Tipos de Conteúdo

| Tipo | Descrição | Destino Local |
|------|-----------|---------------|
| `skill` | Skills do Claude Code (.md com frontmatter) | `.claude/skills/{slug}.md` |
| `instruction` | Rules e instruções (CLAUDE.md-style) | `.claude/CLAUDE.md` |
| `mcp_config` | Configuração de MCP servers (JSON) | `.mcp.json` |
| `agent` | Definições de agentes | `.claude/agents/{slug}.md` |
| `hook` | Definições de hooks | `.claude/hook-{slug}.md` |
| `memory` | Snippets de memória/contexto | `.claude/memory/{slug}.md` |
| `snippet` | Blocos de texto reutilizáveis | `.claude/snippets/{slug}.md` |

## Fluxo de Autenticação

1. Usuário registra conta via API (`POST /auth/register`)
2. Gera API key via JWT auth (`POST /auth/api-keys`)
3. Configura API key no MCP server local
4. MCP server autentica via `Authorization: Bearer myinst_xxx`
5. API valida hash SHA-256 da key contra o banco

### Formato da API Key

```
myinst_[32 chars random base64url]
```

Prefixo `myinst_` para identificação. Primeiros 14 chars armazenados para lookup. Hash SHA-256 completo no banco.
