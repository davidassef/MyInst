# @myinst/mcp-server

Servidor MCP do MyInst para sincronizar skills, instructions, agents, hooks, memory e snippets com o vault remoto.

## Instalacao

```bash
npm install -g @myinst/mcp-server
```

## Uso

```bash
MYINST_API_KEY=myinst_xxx MYINST_SERVER=https://api.seudominio.com myinst-mcp
```

## Fluxo padrao

O fluxo recomendado e local-first:

1. Use `myinst_pull` para materializar o vault no projeto local.
2. Trabalhe sobre os arquivos em `.claude/`.
3. Use `myinst_push` depois de criar, editar ou reescrever skills e instrucoes.

`myinst_pull` tambem cria ou atualiza `.claude/MYINST.md`, um guia operacional para o agente entender como usar o MyInst sem depender de consultas repetidas.

Use `myinst_search` apenas para descoberta pontual quando ainda nao souber qual conteudo materializar.

## Ajuda

```bash
myinst-mcp --help
```

## Requisitos

- Node.js 22+
- chave de API do MyInst
- servidor MyInst acessivel

## Repositorio

- Projeto: <https://github.com/davidassef/MyInst>
- Issues: <https://github.com/davidassef/MyInst/issues>
