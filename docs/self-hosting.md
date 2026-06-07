# Self-Hosting

MyInst pode ser hospedado em qualquer servidor com Docker ou Node.js + PostgreSQL.

## Arquitetura recomendada

- VPS (atual): `16.52.85.33`
- API: `16.52.85.33` (via Docker Compose)
- Shared infra: PostgreSQL + Redis na mesma VPS
- Frontend: Vercel apontando para `myinst.lotoscore.com.br`
- API pública: `api-myinst.lotoscore.com.br`

Deploy sempre via `git pull`, sem cópia manual de arquivos.

## Com Docker Compose (recomendado)

### 1. Clone o repositório

```bash
git clone git@github.com:davidassef/MyInst.git
cd myinst
```

### 2. Configure o ambiente

```bash
cp .env.example .env
```

Edite `.env`:
```env
DB_PASSWORD=senha-forte
POSTGRES_PASSWORD=senha-root-forte
JWT_SECRET=gere-um-secret-longo-e-aleatorio
PORT=3000
NODE_ENV=production
APP_URL=https://myinst.lotoscore.com.br
API_PUBLIC_URL=https://api-myinst.lotoscore.com.br
CORS_ORIGIN=https://myinst.lotoscore.com.br
WEB_OAUTH_SUCCESS_URL=https://myinst.lotoscore.com.br/login
OAUTH_CALLBACK_URL=https://api-myinst.lotoscore.com.br
```

### 3. Suba a shared-infra (primeiro)

```bash
docker compose --env-file deploy/.env.production.example -f deploy/docker-compose.shared-infra.yml up -d
```

### 4. Suba a API

```bash
docker compose --env-file .env -f deploy/docker-compose.vps-api-traefik.yml up -d --build
```

Para primeiro deploy com schema:

```bash
MYINST_COMPOSE_FILE=deploy/docker-compose.vps-api-traefik.yml MYINST_ENV_FILE=.env pnpm db:deploy:schema
```

Observação: se estiver usando Traefik no VPS, mantenha `MYINST_API_HOST=api-myinst.lotoscore.com.br` em `.env`.

Observação: se você precisar da stack web no próprio VPS, use `docker-compose.vps.yml`.

## Sem Docker

### Pré-requisitos

- Node.js >= 22
- PostgreSQL 16+
- pnpm >= 10

### Setup

```bash
git clone git@github.com:davidassef/MyInst.git
cd myinst
cp .env.example .env
# Configure DATABASE_URL e JWT_SECRET no .env
pnpm install
pnpm db:push
pnpm build
pnpm --filter @myinst/backend start
```

## Frontend na Vercel (monorepo)

O frontend em `frontend/` é independente do backend: não importa `@myinst/shared` nem `@myinst/backend`. O Turborepo só orquestra o desenvolvimento local; na Vercel você publica apenas a pasta frontend.

### Configuração do projeto

1. Importe o repositório na Vercel.
2. Em **Root Directory**, selecione `frontend`.
3. A Vercel deve detectar Vite automaticamente. O arquivo `frontend/vercel.json` já define install/build/output para o monorepo pnpm.
4. Configure a variável de ambiente:

```env
VITE_MYINST_API_BASE=https://api-myinst.lotoscore.com.br
```

### Por que funciona com Root Directory

Mesmo compartilhando o repositório com o backend, o `frontend/` tem dependências próprias (React, Vite, Tailwind). O `installCommand` sobe um nível (`..`) para rodar `pnpm install` na raiz do workspace e resolver o lockfile. O `buildCommand` compila só o frontend e gera `dist/`.

## Backup

### Banco de dados

```bash
pg_dump -h localhost -U myinst myinst > backup_$(date +%Y%m%d).sql
```

### Restaurar

```bash
psql -h localhost -U myinst myinst < backup_20250101.sql
```

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição | Exemplo |
|----------|:-----------:|-----------|---------|
| `DATABASE_URL` | Sim | Connection string PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Sim | Secret para assinar tokens JWT | String aleatória longa |
| `APP_URL` | Sim em produção | URL pública da web | `https://seudominio.com` |
| `API_PUBLIC_URL` | Sim em produção | URL pública da API | `https://seudominio.com` |
| `CORS_ORIGIN` | Sim em produção | Origem permitida no CORS | `https://seudominio.com` |
| `WEB_OAUTH_SUCCESS_URL` | Sim em produção | Retorno OAuth no frontend | `https://seudominio.com/login` |
| `OAUTH_CALLBACK_URL` | Sim se OAuth estiver ativo | Base dos callbacks OAuth | `https://seudominio.com` |
| `MYINST_API_HOST` | Sim com Traefik | Hostname exposto no Traefik | `api-myinst.seudominio.com` |
| `VITE_MYINST_API_BASE` | Não | Base da API usada pelo frontend em produção | `https://api-myinst.lotoscore.com.br` |
| `PORT` | Não | Porta do servidor (padrão: 3000) | `3000` |
| `NODE_ENV` | Não | Ambiente (development/production) | `production` |

## Segurança

- Sempre use HTTPS em produção (via reverse proxy)
- Gere um `JWT_SECRET` forte: `openssl rand -base64 64`
- Restrinja acesso ao PostgreSQL (não exponha porta 5432)
- Configure firewall para permitir apenas porta 443
- Faça backups regulares do banco
