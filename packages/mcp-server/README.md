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
- replica client profiles globais compatíveis entre clients suportados

## Fluxo oficial

O fluxo recomendado continua sendo:

```text
myinst_pull -> trabalho local -> myinst_push
```

## Segurança operacional

Antes de executar `myinst_push`, o agente deve respeitar:

- nunca incluir segredos em texto plano (`token`, `api key`, `secret`, `password`, `.env`, `oauth`, `cookie`);
- substituir valores sensíveis por placeholders `{{...}}`;
- se um valor for obrigatório para operação local, manter estrutura do arquivo e pedir preenchimento manual no ambiente do usuário;
- usar `dryRun` para validar ações antes de gravar no vault;
- manter `.claude/MYINST.md` como fonte de operação e não como banco de segredos.

Checklist obrigatória de pré-push:

- revisar o conteúdo local no projeto selecionado;
- confirmar `sem segredos reais` em texto plano;
- garantir `placeholders` nos campos sensíveis;
- só então executar `myinst_push`.

`myinst_pull` cria ou atualiza `.claude/MYINST.md` para instruir o agente sobre:

- diferenca entre `scope=project` e `scope=global`
- uso de `clients` quando houver multiplos clientes detectados
- fluxo correto `pull -> trabalho local -> push`
- regra de que configuracoes globais vao para `Client Profiles`, nao para projetos

## Escopos

- `project`: conteudo do repositorio atual, salvo em `workspace/project`
- `global`: configuracoes e skills globais de cliente, salvas em `Client Profiles`
- `all`: combina os dois, separando o destino correto por item

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

## Replicação entre clients

O v1 expõe replicação segura apenas para `Client Profiles` globais e somente nos pares:

- `claude -> opencode`
- `codex -> opencode`

Tool:

```text
myinst_replicate_client_profile
```

Política padrão:

- copiar apenas itens ausentes
- não sobrescrever por padrão
- ignorar e relatar tipos sem equivalente nativo claro

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
