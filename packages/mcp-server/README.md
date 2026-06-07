# @myinst/mcp-server

Servidor MCP do MyInst para sincronizar skills, instructions, agents, hooks, memory e snippets com o vault remoto.

## Instalacao

```bash
npm install -g @myinst/mcp-server
```

## Uso

```bash
MYINST_API_KEY=myinst_xxx MYINST_SERVER=https://api-myinst.lotoscore.com.br myinst-mcp
```

## Fluxo padrao

O fluxo recomendado e local-first:

1. Use `myinst_pull` para materializar o vault no projeto local.
2. Trabalhe sobre os arquivos locais materializados ou existentes em `.claude/`, `.codex/`, `AGENTS.md`, `CLAUDE.md` e `.mcp.json`.
3. Use `myinst_push` depois de criar, editar, importar ou reescrever skills, instrucoes e configuracoes MCP.

`myinst_pull` tambem cria ou atualiza `.claude/MYINST.md`, um guia operacional para o agente entender como usar o MyInst sem depender de consultas repetidas.

Na sincronizacao local, o MCP reconhece estruturas conhecidas como:

- `.claude/skills`, `.claude/agents`, `.claude/memory`, `.claude/snippets`, `.claude/hooks`
- `.claude/CLAUDE.md` e `*.rules.md`
- `.codex/skills/<slug>/SKILL.md`
- `.codex/AGENTS.md`
- `AGENTS.md`, `CLAUDE.md` e `.mcp.json` na raiz do projeto

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
