# Go-Live Checklist

Checklist final para colocar o MyInst em produção depois que o repositório
já estiver validado com `pnpm lint`, `pnpm build` e `pnpm test`.

Antes do go-live, execute também:

```bash
pnpm release:check
```

## 1. Publicação npm

- [ ] Criar a organização `@myinst` no npmjs.com
- [ ] Executar `npm login`
- [ ] Publicar `@myinst/shared`
  ```bash
  cd packages/shared
  pnpm build
  npm publish --access public
  ```
- [ ] Publicar `@myinst/mcp-server`
  ```bash
  cd packages/mcp-server
  pnpm build
  npm publish --access public
  ```
- [ ] Publicar `@myinst/cli`
  ```bash
  cd packages/cli
  pnpm build
  npm publish --access public
  ```
- [ ] Verificar publicação
  ```bash
  npm info @myinst/shared
  npm info @myinst/mcp-server
  npm info @myinst/cli
  npx @myinst/mcp-server --version
  npx @myinst/cli --help
  ```

## 2. OAuth

### Google

- [ ] Criar projeto no Google Cloud Console
- [ ] Ativar credenciais OAuth 2.0 Web
- [ ] Configurar redirect URI:
  - `https://api.seudominio.com/api/v1/auth/oauth/google/callback`
- [ ] Preencher `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`

### GitHub

- [ ] Criar OAuth App em GitHub Developer Settings
- [ ] Configurar callback URL:
  - `https://api.seudominio.com/api/v1/auth/oauth/github/callback`
- [ ] Preencher `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`

## 3. Infra compartilhada

- [ ] Preparar `.env` de produção a partir de [deploy/.env.production.example](/D:/Documentos/Projetos/MyInst/deploy/.env.production.example)
- [ ] Subir shared-infra
  ```bash
  docker compose -f deploy/docker-compose.shared-infra.yml up -d
  ```
- [ ] Confirmar containers:
  - `shared-postgres`
  - `shared-redis`
- [ ] Confirmar rede `shared-infra-net`

## 4. Deploy VPS

- [ ] Comprar domínio
- [ ] Apontar DNS para a VPS
- [ ] Instalar Docker e Docker Compose Plugin na VPS
- [ ] Subir aplicação
  ```bash
  docker compose -f docker-compose.vps.yml up -d --build
  ```
- [ ] Validar healthcheck
  ```bash
  curl http://127.0.0.1:3010/health
  ```
- [ ] Configurar proxy reverso e TLS
  - API: `api.seudominio.com -> 127.0.0.1:3010`
  - Web: `app.seudominio.com -> 127.0.0.1:3011`
- [ ] Emitir certificados com Certbot

## 5. Smoke Test

- [ ] Abrir a UI web
- [ ] Registrar usuário novo
- [ ] Criar API key
- [ ] Testar login com email/senha
- [ ] Testar login OAuth Google
- [ ] Testar login OAuth GitHub
- [ ] Criar projeto
- [ ] Criar conteúdo
- [ ] Editar conteúdo e validar versionamento
- [ ] Executar `myinst_pull`
- [ ] Executar `myinst_push`
- [ ] Executar `myinst_import`
- [ ] Executar `myinst_search`
- [ ] Executar `myinst_status`

## 6. Pós-deploy

- [ ] Criar backup inicial do banco
- [ ] Validar logs dos containers
- [ ] Confirmar limites de plano no endpoint `/api/v1/usage`
- [ ] Confirmar publicação e instalação do MCP package em uma máquina limpa
- [ ] Confirmar instalação e uso do CLI em uma máquina limpa
