# Go-Live Checklist

Checklist para o primeiro deploy do MyInst em beta privado, saindo de localhost direto para produção.

## Ambiente alvo

- VPS de deploy atual: `16.52.85.33`
- Papel da VPS: hospedar web, API e shared-infra do MyInst
- O subdomínio público ainda será definido e deverá apontar para esse IP

## 1. Preflight local

Execute antes de qualquer deploy:

```bash
pnpm validate
pnpm compose:check
```

Para simular produção localmente, use:

```bash
pnpm prod:preflight
```

Esse comando sobe Postgres local, aplica schema, sobe API em modo produção e executa smoke test. Ele altera o banco local do compose.

## 2. DNS e proxy

- Use domínio único para web e API.
- Web: `https://seudominio.com/`
- API: `https://seudominio.com/api/`
- O proxy reverso público deve apontar para `127.0.0.1:3011`, pois o Nginx do container web encaminha `/api/` para `myinst-api`.

## 3. Variáveis de produção

Na VPS `16.52.85.33`:

```bash
cp deploy/.env.production.example .env
```

Preencha:

```env
APP_URL=https://seudominio.com
API_PUBLIC_URL=https://seudominio.com
CORS_ORIGIN=https://seudominio.com
WEB_OAUTH_SUCCESS_URL=https://seudominio.com/login
OAUTH_CALLBACK_URL=https://seudominio.com
JWT_SECRET=secret-longo-gerado-com-openssl
DB_PASSWORD=senha-forte
POSTGRES_PASSWORD=senha-root-forte
REDIS_PASSWORD=senha-redis-forte
```

Gere secrets com:

```bash
openssl rand -base64 64
```

## 4. Deploy via Git

Nunca copie arquivos manualmente para a VPS. Use apenas `git pull`.

```bash
cd ~/MyInst
git pull origin main
docker compose --env-file .env -f deploy/docker-compose.shared-infra.yml up -d
MYINST_COMPOSE_FILE=docker-compose.vps.yml MYINST_ENV_FILE=.env pnpm db:deploy:schema
docker compose --env-file .env -f docker-compose.vps.yml up -d --build
```

## 5. Validação pós-deploy

```bash
curl https://seudominio.com/health
MYINST_SMOKE_BASE_URL=https://seudominio.com pnpm smoke
```

Valide também:

- registro por email/senha;
- criação de API key;
- configuração do `myinst-mcp` com API key real;
- `myinst_pull`;
- `myinst_push`;
- `myinst_search`;
- versionamento no web.

## 6. Backup inicial

Antes de liberar uso real:

```bash
pnpm db:backup
```

Restore exige confirmação explícita:

```bash
MYINST_CONFIRM_RESTORE=CONFIRMO_RESTORE pnpm db:restore backups/arquivo.sql
```

## 7. OAuth

OAuth é opcional no beta privado. Se configurar:

- Google callback: `https://seudominio.com/api/v1/auth/oauth/google/callback`
- GitHub callback: `https://seudominio.com/api/v1/auth/oauth/github/callback`

Após o callback, o backend redireciona para `WEB_OAUTH_SUCCESS_URL` com o token.
