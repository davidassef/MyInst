# Migração para Shared-Infra Padronizada

A infra compartilhada do MyInst agora está versionada neste repositório em
`deploy/docker-compose.shared-infra.yml`.

## Resumo para o MyInst

O MyInst já nasce na rede padronizada. Para deploy:

```bash
# 1. Garantir que shared-infra está rodando
docker compose -f deploy/docker-compose.shared-infra.yml --env-file deploy/.env.production.example up -d

# 2. Deploy do MyInst
cd ~/myinst
docker compose -f deploy/docker-compose.vps-api.yml up -d --build

# 3. Verificar
curl http://localhost:3010/health
```

## Portas do MyInst

| Serviço | Porta |
|---------|-------|
| API | 127.0.0.1:3010 |
