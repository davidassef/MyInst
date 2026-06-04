#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MyInstClient } from './client/index.js';
import { aplicarConteudo } from './applier/index.js';
import type { ConflictStrategy } from './applier/index.js';
import { lerConteudoLocal } from './reader/index.js';
import { importarDiretorio, detectarNomeRepositorio } from './importer/index.js';
import { montarPreviewPull } from './pull-preview.js';

const MYINST_VERSION = '0.1.0-beta.1';
const MYINST_API_KEY = process.env.MYINST_API_KEY;
const MYINST_SERVER = process.env.MYINST_SERVER || 'http://localhost:3000';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log([
    'myinst-mcp',
    '',
    'Uso:',
    '  MYINST_API_KEY=<token> MYINST_SERVER=<url> myinst-mcp',
    '',
    'Variaveis de ambiente:',
    '  MYINST_API_KEY  Chave de API do MyInst',
    '  MYINST_SERVER   URL base da API MyInst (padrao: http://localhost:3000)',
    '  MYINST_MODEL    Nome do modelo para resolucao automatica de perfil',
  ].join('\n'));
  process.exit(0);
}

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(MYINST_VERSION);
  process.exit(0);
}

if (!MYINST_API_KEY) {
  console.error('[ERROR] MYINST_API_KEY não configurada');
  process.exit(1);
}

const client = new MyInstClient(MYINST_SERVER, MYINST_API_KEY);

const server = new McpServer({
  name: 'myinst',
  version: MYINST_VERSION,
});

server.tool(
  'myinst_list_workspaces',
  'Lista todos os workspaces do seu vault MyInst',
  {},
  async () => {
    const workspaces = await client.listarWorkspaces();
    return {
      content: [{ type: 'text', text: JSON.stringify(workspaces, null, 2) }],
    };
  },
);

server.tool(
  'myinst_list_projects',
  'Lista todos os projetos do seu vault MyInst',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
  },
  async ({ workspace }) => {
    const projetos = await client.listarProjetosDoWorkspace(workspace);
    return {
      content: [{ type: 'text', text: JSON.stringify(projetos, null, 2) }],
    };
  },
);

server.tool(
  'myinst_pull',
  'Materializa o vault MyInst no projeto local, instala .claude/MYINST.md e prepara o fluxo pull -> trabalho local -> push',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto para puxar (omita para "default")').optional(),
    types: z.array(z.string()).describe('Tipos de conteúdo para puxar (skill, instruction, mcp_config, agent, hook, memory)').optional(),
    tags: z.array(z.string()).describe('Filtrar por tags de modelo/provider').optional(),
    model: z.string().describe('Nome do modelo para auto-detectar perfil e aplicar tags (ex: claude-opus-4)').optional(),
    dryRun: z.boolean().describe('Apenas mostra o que seria aplicado sem escrever arquivos').optional(),
    targetDir: z.string().describe('Diretório alvo para aplicar as configs (padrão: diretório atual)').optional(),
    conflictStrategy: z.enum(['overwrite', 'prefix', 'skip']).describe('O que fazer quando arquivo local já existe: overwrite (substitui), prefix (cria vault-<slug>), skip (ignora)').optional(),
  },
  async ({ workspace, project, types, tags, model, dryRun, targetDir, conflictStrategy }) => {
    const slug = project || 'default';

    const modelName = model || process.env.MYINST_MODEL;
    let tagsFinais = tags || [];

    if (modelName) {
      const perfil = await client.matchProfile(modelName, workspace);
      if (perfil) {
        const tagsSet = new Set([...tagsFinais, ...perfil.tags]);
        tagsFinais = [...tagsSet];
      }
    }

    const resultado = await client.pull({
      workspace,
      project: slug,
      types,
      tags: tagsFinais.length > 0 ? tagsFinais : undefined,
    });

    if (dryRun) {
      return {
        content: [{
          type: 'text',
          text: montarPreviewPull(resultado.items),
        }],
      };
    }

    const dir = targetDir || process.cwd();
    const strategy: ConflictStrategy = conflictStrategy || 'overwrite';
    const aplicados = await aplicarConteudo(resultado.items, dir, strategy);

    const criados = aplicados.filter((a) => a.status === 'created');
    const sobrescritos = aplicados.filter((a) => a.status === 'overwritten');
    const prefixados = aplicados.filter((a) => a.status === 'prefixed');
    const ignorados = aplicados.filter((a) => a.status === 'skipped');

    const linhas = [`${aplicados.length} item(ns) processados em ${dir}:`];
    if (criados.length > 0) linhas.push(`  - Criados: ${criados.length}`);
    if (sobrescritos.length > 0) linhas.push(`  - Substituídos: ${sobrescritos.length}`);
    if (prefixados.length > 0) linhas.push(`  - Com prefixo (vault-): ${prefixados.length}`);
    if (ignorados.length > 0) linhas.push(`  - Ignorados (já existem): ${ignorados.length}`);
    linhas.push('');
    for (const a of aplicados.filter((x) => x.status !== 'skipped')) {
      linhas.push(`  [${a.type}] ${a.title} → ${a.path}`);
    }

    return {
      content: [{ type: 'text', text: linhas.join('\n') }],
    };
  },
);

server.tool(
  'myinst_search',
  'Busca conteúdo no vault MyInst por texto para descoberta pontual; prefira myinst_pull para trabalho recorrente',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto').optional(),
    query: z.string().describe('Texto para buscar no título ou corpo'),
    type: z.string().describe('Filtrar por tipo de conteúdo').optional(),
  },
  async ({ workspace, project, query, type }) => {
    const filtrados = await client.buscarConteudo({ query, workspace, project, type });

    return {
      content: [{
        type: 'text',
        text: filtrados.length === 0
          ? `Nenhum resultado para "${query}"`
          : `${filtrados.length} resultado(s):\n${JSON.stringify(filtrados.map((i) => ({ type: i.type, title: i.title, slug: i.slug, tags: i.tags, project: i.project_slug })), null, 2)}`,
      }],
    };
  },
);

server.tool(
  'myinst_status',
  'Verifica o que mudou no vault desde o último sync',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto').optional(),
    since: z.string().describe('Data ISO para verificar mudanças desde (ex: 2025-01-01T00:00:00Z)').optional(),
  },
  async ({ workspace, project, since }) => {
    const slug = project || 'default';
    const status = await client.status(slug, since, workspace);

    return {
      content: [{
        type: 'text',
        text: `${status.changedCount} item(ns) alterado(s) desde ${since || 'sempre'}:\n${JSON.stringify(status.items, null, 2)}`,
      }],
    };
  },
);

server.tool(
  'myinst_push',
  'Sincroniza alterações locais em .claude/ de volta para o vault MyInst após criar ou editar skills e instruções',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto destino (omita para "default")').optional(),
    sourceDir: z.string().describe('Diretório fonte com .claude/ (padrão: diretório atual)').optional(),
    types: z.array(z.string()).describe('Tipos de conteúdo para enviar (skill, agent, memory, snippet, instruction)').optional(),
    dryRun: z.boolean().describe('Apenas mostra o que seria enviado sem efetuar push').optional(),
  },
  async ({ workspace, project, sourceDir, types, dryRun }) => {
    const slug = project || 'default';
    const dir = sourceDir || process.cwd();

    let itens = await lerConteudoLocal(dir);

    if (types && types.length > 0) {
      itens = itens.filter((item) => types.includes(item.type));
    }

    if (itens.length === 0) {
      return {
        content: [{ type: 'text', text: 'Nenhum conteúdo encontrado em .claude/ para enviar.' }],
      };
    }

    if (dryRun) {
      const preview = itens.map((item) => ({ type: item.type, title: item.title, slug: item.slug }));
      return {
        content: [{
          type: 'text',
          text: `[DRY RUN] ${itens.length} item(ns) seriam enviados:\n${JSON.stringify(preview, null, 2)}`,
        }],
      };
    }

    const resultado = await client.push({ workspace, project: slug, items: itens });

    return {
      content: [{
        type: 'text',
        text: `Push concluído para projeto "${slug}":\n  - Criados: ${resultado.created.length} (${resultado.created.join(', ') || 'nenhum'})\n  - Atualizados: ${resultado.updated.length} (${resultado.updated.join(', ') || 'nenhum'})`,
      }],
    };
  },
);

server.tool(
  'myinst_import',
  'Importa conteúdo de qualquer diretório com estrutura Claude Code para o vault MyInst (skills, agents, memory, hooks, etc.). Organiza automaticamente em pasta com o nome do repositório.',
  {
    sourceDir: z.string().describe('Diretório fonte para escanear recursivamente'),
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto destino (omita para "default")').optional(),
    folderName: z.string().describe('Nome da pasta destino (omita para auto-detectar via git remote ou nome da pasta)').optional(),
    dryRun: z.boolean().describe('Apenas mostra o que seria importado sem efetuar push').optional(),
    overwrite: z.boolean().describe('Sobrescrever itens existentes (padrão: false)').optional(),
  },
  async ({ sourceDir, workspace, project, folderName, dryRun, overwrite }) => {
    const slug = project || 'default';
    const itens = await importarDiretorio(sourceDir);

    if (itens.length === 0) {
      return {
        content: [{ type: 'text', text: 'Nenhum conteúdo importável encontrado no diretório.' }],
      };
    }

    const nomeRepo = folderName || detectarNomeRepositorio(sourceDir);

    if (dryRun) {
      const preview = itens.map((item) => ({ type: item.type, title: item.title, slug: item.slug }));
      return {
        content: [{
          type: 'text',
          text: `[DRY RUN] ${itens.length} item(ns) seriam importados para pasta "${nomeRepo}":\n${JSON.stringify(preview, null, 2)}`,
        }],
      };
    }

    const pastasExistentes = await client.listarPastas(slug, workspace);
    const pastaExistente = pastasExistentes.find((p) => p.slug === nomeRepo);

    if (!pastaExistente) {
      const nomeFormatado = nomeRepo
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
      await client.criarPasta(slug, { name: nomeFormatado, slug: nomeRepo }, workspace);
    }

    const existentes = await client.pull({ workspace, project: slug });
    const slugsExistentes = new Set(existentes.items.map((i) => `${i.type}:${i.slug}`));

    const paraEnviar = [];
    const ignorados = [];

    for (const item of itens) {
      const chave = `${item.type}:${item.slug}`;
      if (slugsExistentes.has(chave) && !overwrite) {
        ignorados.push(item);
      } else {
        paraEnviar.push(item);
      }
    }

    if (paraEnviar.length === 0) {
      const conflitos = ignorados.map((i) => `  - [${i.type}] ${i.slug}`).join('\n');
      return {
        content: [{
          type: 'text',
          text: `Nenhum item novo para importar. ${ignorados.length} item(ns) já existem no vault:\n${conflitos}\n\nUse overwrite: true para sobrescrever.`,
        }],
      };
    }

    const resultado = await client.push({ workspace, project: slug, folderSlug: nomeRepo, items: paraEnviar });

    const linhas = [
      `Import concluído para projeto "${slug}" → pasta "${nomeRepo}":`,
      `  - Criados: ${resultado.created.length} (${resultado.created.join(', ') || 'nenhum'})`,
      `  - Atualizados: ${resultado.updated.length} (${resultado.updated.join(', ') || 'nenhum'})`,
    ];

    if (ignorados.length > 0) {
      linhas.push(`  - Ignorados (já existem): ${ignorados.length} (${ignorados.map((i) => i.slug).join(', ')})`);
    }

    return {
      content: [{ type: 'text', text: linhas.join('\n') }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
