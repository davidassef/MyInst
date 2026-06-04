# MCP Server

O `@myinst/mcp-server` é um servidor MCP que roda localmente na máquina do usuário, conectando qualquer cliente MCP (Claude Code, Cursor, VS Code, etc.) ao vault MyInst.

## Instalação

```bash
npm install -g @myinst/mcp-server
```

O pacote expõe o binário `myinst-mcp`.

## Configuração

Adicione ao seu arquivo de configuração MCP:

### Claude Code (`.mcp.json`)

```json
{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_API_KEY": "myinst_sua_key_aqui",
        "MYINST_SERVER": "http://localhost:3000"
      }
    }
  }
}
```

### Cursor / VS Code

Adicione nas configurações do MCP da extensão com os mesmos parâmetros.

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `MYINST_API_KEY` | Sim | API key gerada no servidor |
| `MYINST_SERVER` | Não | URL do servidor (padrão: `http://localhost:3000`) |

## Tools Disponíveis

### myinst_list_projects

Lista todos os projetos do vault.

**Parâmetros:** nenhum

**Exemplo de uso:**
```
"Liste meus projetos no MyInst"
```

### myinst_pull

Puxa configurações do vault e aplica ao diretório do projeto local.

**Parâmetros:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `project` | string? | Slug do projeto (padrão: "default") |
| `types` | string[]? | Tipos para puxar (skill, instruction, mcp_config, agent, hook, memory) |
| `tags` | string[]? | Filtrar por tags de modelo/provider |
| `dryRun` | boolean? | Apenas mostra o que seria aplicado |
| `targetDir` | string? | Diretório alvo (padrão: diretório atual) |

**Exemplo de uso:**
```
"Puxe minhas skills do projeto meu-saas filtradas por claude-opus"
```

**Mapeamento de arquivos:**

| Tipo | Destino |
|------|---------|
| skill | `.claude/skills/{slug}.md` |
| instruction | `.claude/CLAUDE.md` |
| mcp_config | `.mcp.json` |
| agent | `.claude/agents/{slug}.md` |
| hook | `.claude/hook-{slug}.md` |
| memory | `.claude/memory/{slug}.md` |
| snippet | `.claude/snippets/{slug}.md` |

### myinst_search

Busca conteúdo no vault por texto usando a busca full-text do servidor.

**Parâmetros:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `project` | string? | Slug do projeto (padrão: "default") |
| `query` | string | Texto para buscar |
| `type` | string? | Filtrar por tipo |

### myinst_status

Verifica o que mudou no vault desde o último sync.

**Parâmetros:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `project` | string? | Slug do projeto (padrão: "default") |
| `since` | string? | Data ISO para verificar mudanças |

## Fluxo de Uso Típico

1. Registre-se no servidor MyInst
2. Gere uma API key
3. Configure o MCP server no seu cliente
4. Use `myinst_pull` para aplicar suas configs ao projeto
5. Trabalhe normalmente — suas instruções estarão ativas

## Dry Run

Use `dryRun: true` para ver o que seria aplicado sem escrever arquivos:

```
"Faça um dry run do pull do projeto default com tag claude-opus"
```

Retorna lista de itens que seriam aplicados com tipo, título e slug.
