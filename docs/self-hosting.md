# Self-Hosting

MyInst pode ser hospedado em qualquer servidor com Docker ou Node.js + PostgreSQL.

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
DATABASE_URL=postgresql://myinst:senha-segura@db:5432/myinst
JWT_SECRET=gere-um-secret-longo-e-aleatorio
PORT=3000
NODE_ENV=production
APP_URL=https://seudominio.com
API_PUBLIC_URL=https://seudominio.com
CORS_ORIGIN=https://seudominio.com
WEB_OAUTH_SUCCESS_URL=https://seudominio.com/login
OAUTH_CALLBACK_URL=https://seudominio.com
```

### 3. Suba os containers

```bash
docker compose up -d
pnpm db:deploy:schema
```

### docker-compose.yml

```yaml
services:
  myinst:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://myinst:senha-segura@db:5432/myinst
      - JWT_SECRET=${JWT_SECRET}
      - PORT=3000
      - NODE_ENV=production
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=myinst
      - POSTGRES_PASSWORD=senha-segura
      - POSTGRES_DB=myinst
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myinst"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pg-data:
```

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
pnpm --filter @myinst/server start
```

## Reverse Proxy (Nginx)

Para expor com HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name seudominio.com;

    ssl_certificate /etc/letsencrypt/live/seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3011;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

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
| `PORT` | Não | Porta do servidor (padrão: 3000) | `3000` |
| `NODE_ENV` | Não | Ambiente (development/production) | `production` |

## Segurança

- Sempre use HTTPS em produção (via reverse proxy)
- Gere um `JWT_SECRET` forte: `openssl rand -base64 64`
- Restrinja acesso ao PostgreSQL (não exponha porta 5432)
- Configure firewall para permitir apenas porta 443
- Faça backups regulares do banco
