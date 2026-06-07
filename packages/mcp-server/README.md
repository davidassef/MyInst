# @myinst/mcp-server

Servidor MCP local do MyInst para sincronizar contexto agentic com o vault remoto.

## Instalação

```bash
npm install -g @myinst/mcp-server
```

## Execução

```bash
MYINST_API_KEY=myinst_xxx MYINST_SERVER=https://api-myinst.lotoscore.com.br myinst-mcp
```

## O que ele faz

- lista workspaces e projetos
- materializa o vault em formato canônico
- exporta para formatos nativos de clientes suportados
- importa estruturas locais conhecidas
- sincroniza mudanças locais de volta para o backend

## Fluxo oficial

O fluxo recomendado continua sendo:

```text
myinst_pull -> trabalho local -> myinst_push
```

`myinst_pull` cria ou atualiza `.claude/MYINST.md` para instruir o agente a preferir arquivos locais materializados em vez de consulta repetida.

## Descoberta multi-cliente

O pacote detecta clientes locais suportados e exige seleção explícita quando encontra múltiplas origens.

Ferramenta principal para inspeção:

```text
myinst_list_sync_targets
```

Clientes desta fase:

- Claude Code
- Codex
- Cursor
- Gemini CLI
- OpenCode
- Qwen Code
- Aider
- Antigravity

## Tipos sincronizáveis

- `skill`
- `instruction`
- `mcp_config`
- `agent`
- `hook`
- `memory`
- `snippet`

Nem todo cliente suporta todos os tipos em formato nativo. O MCP informa explicitamente o que foi ignorado.

## Ajuda

```bash
myinst-mcp --help
myinst-mcp --version
```

## Requisitos

- Node.js 22+
- API key do MyInst
- backend MyInst acessível

## Documentação complementar

- Projeto: <https://github.com/davidassef/MyInst>
- Guia MCP: <https://github.com/davidassef/MyInst/blob/main/docs/mcp-server.md>
- Issues: <https://github.com/davidassef/MyInst/issues>
