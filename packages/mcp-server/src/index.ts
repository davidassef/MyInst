#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MyInstClient } from './client/index.js';
import { aplicarConteudo } from './applier/index.js';
import type { ConflictStrategy } from './applier/index.js';
import { detectarNomeRepositorio } from './importer/index.js';
import { montarPreviewPull } from './pull-preview.js';
import {
  exportarParaClientesNativos,
  importarTargetsDetectados,
  listarSyncTargets,
  obterClientesSuportados,
  resolverSelecaoSync,
  type EscopoSync,
  type EscritaCliente,
  type FormatoPull,
  type ItemSincronizavel,
  type SyncTarget,
  type TipoSincronizavel,
} from './sync-targets/index.js';

const MYINST_VERSION = '0.1.0-beta.1';
const MYINST_API_KEY = process.env.MYINST_API_KEY;
const MYINST_SERVER = process.env.MYINST_SERVER || 'http://localhost:3000';
const SCOPES_SYNC = ['project', 'global', 'all'] as const;
const FORMATOS_PULL = ['myinst', 'native'] as const;
const TIPOS_CANONICOS = ['skill', 'instruction', 'mcp_config', 'agent', 'hook', 'memory', 'snippet'] as const;

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
  'myinst_list_sync_targets',
  'Detecta clientes locais sincronizáveis e mostra escopo, paths, tipos suportados e nível de suporte antes de importar, exportar ou sincronizar',
  {
    sourceDir: z.string().describe('Diretório base a partir do qual o MyInst deve detectar clientes e estruturas').optional(),
    scope: z.enum(SCOPES_SYNC).describe('Escopo da descoberta: project, global ou all').optional(),
    clients: z.array(z.string()).describe('Filtra a descoberta para clientes específicos').optional(),
  },
  async ({ sourceDir, scope, clients }) => {
    const dir = sourceDir || process.cwd();
    const targets = await listarSyncTargets(dir, scope, clients);
    const clientesSuportados = obterClientesSuportados();

    return respostaTexto([
      `Diretório base: ${dir}`,
      'Escopos:',
      '  - global: configurações e skills do cliente na home do usuário, válidas para todos os projetos',
      '  - project: configurações e skills nativas encontradas dentro do diretório analisado',
      '',
      'Clientes suportados:',
      JSON.stringify(clientesSuportados, null, 2),
      '',
      targets.length === 0
        ? 'Nenhum cliente sincronizável foi detectado.'
        : `Clientes detectados (${targets.length} alvo(s)):\n${JSON.stringify(targets, null, 2)}`,
    ].join('\n'));
  },
);

server.tool(
  'myinst_pull',
  'Materializa o vault MyInst localmente. No formato canônico, instala .claude/MYINST.md; no formato native, exporta para os caminhos nativos dos clientes selecionados.',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto para puxar (omita para "default")').optional(),
    types: z.array(z.string()).describe('Tipos de conteúdo para puxar').optional(),
    tags: z.array(z.string()).describe('Filtrar por tags de modelo/provider').optional(),
    model: z.string().describe('Nome do modelo para auto-detectar perfil e aplicar tags (ex: claude-opus-4)').optional(),
    dryRun: z.boolean().describe('Apenas mostra o que seria aplicado sem escrever arquivos').optional(),
    targetDir: z.string().describe('Diretório alvo para aplicar as configs (padrão: diretório atual)').optional(),
    conflictStrategy: z.enum(['overwrite', 'prefix', 'skip']).describe('O que fazer quando arquivo local já existe').optional(),
    clients: z.array(z.string()).describe('Clientes nativos alvo ao usar targetFormat native').optional(),
    scope: z.enum(SCOPES_SYNC).describe('Escopo de descoberta para exportação nativa').optional(),
    targetFormat: z.enum(FORMATOS_PULL).describe('myinst materializa o formato canônico; native escreve no formato do cliente').optional(),
  },
  async ({ workspace, project, types, tags, model, dryRun, targetDir, conflictStrategy, clients, scope, targetFormat }) => {
    const slug = project || 'default';
    const dir = targetDir || process.cwd();
    const strategy: ConflictStrategy = conflictStrategy || 'overwrite';
    const formato: FormatoPull = targetFormat || 'myinst';

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

    if (formato === 'myinst') {
      if (dryRun) {
        return respostaTexto([
          montarPreviewPull(resultado.items),
          '',
          `.claude/MYINST.md também seria ${await preverAcaoGuiaMyInst(dir, strategy)}.`,
        ].join('\n'));
      }

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
      for (const aplicado of aplicados.filter((item) => item.status !== 'skipped')) {
        linhas.push(`  [${aplicado.type}] ${aplicado.title} → ${aplicado.path}`);
      }

      return respostaTexto(linhas.join('\n'));
    }

    const resolucao = await resolverSelecaoSync(dir, scope, clients);
    if (resolucao.requiresClientSelection) {
      return respostaSelecaoNecessaria(dir, scope, resolucao.availableTargets, 'pull', 'targetFormat: "native"');
    }

    if (resolucao.selectedTargets.length === 0) {
      return respostaTexto(montarMensagemSemClientes(dir, scope, clients));
    }

    const exportacao = await exportarParaClientesNativos(
      dir,
      normalizarItensVault(resultado.items),
      scope,
      [...new Set(resolucao.selectedTargets.map((target) => target.clientId))],
    );

      if (dryRun) {
      return respostaTexto([
        `[DRY RUN] Exportação nativa a partir do projeto "${slug}" para ${dir}`,
        montarResumoTargets(exportacao.targets),
        montarResumoDryRunNative(exportacao.targets, resultado.items),
      ].join('\n\n'));
    }

    return respostaTexto([
      `Pull nativo concluído para projeto "${slug}" em ${dir}.`,
      montarResumoTargets(exportacao.targets),
      montarResumoEscritaNativa(exportacao.results),
    ].join('\n\n'));
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

    return respostaTexto(
      filtrados.length === 0
        ? `Nenhum resultado para "${query}"`
        : `${filtrados.length} resultado(s):\n${JSON.stringify(filtrados.map((item) => ({
          type: item.type,
          title: item.title,
          slug: item.slug,
          tags: item.tags,
          project: item.project_slug,
          workspace: item.workspace_slug,
        })), null, 2)}`,
    );
  },
);

server.tool(
  'myinst_status',
  'Compara temporalmente o vault e informa o que mudou desde o último sync conhecido',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto').optional(),
    since: z.string().describe('Data ISO para verificar mudanças desde').optional(),
  },
  async ({ workspace, project, since }) => {
    const slug = project || 'default';
    const status = await client.status(slug, since, workspace);

    return respostaTexto(`${status.changedCount} item(ns) alterado(s) desde ${since || 'sempre'}:\n${JSON.stringify(status.items, null, 2)}`);
  },
);

server.tool(
  'myinst_push',
  'Sincroniza alterações locais detectadas em clientes suportados de volta para o vault MyInst. Prioriza formatos nativos conhecidos e ignora caches e runtime interno.',
  {
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto destino (omita para "default")').optional(),
    sourceDir: z.string().describe('Diretório fonte do projeto ou da configuração global (padrão: diretório atual)').optional(),
    types: z.array(z.string()).describe('Tipos de conteúdo para enviar').optional(),
    dryRun: z.boolean().describe('Apenas mostra o que seria enviado sem efetuar push').optional(),
    clients: z.array(z.string()).describe('Clientes a sincronizar').optional(),
    scope: z.enum(SCOPES_SYNC).describe('Escopo de descoberta: project, global ou all').optional(),
  },
  async ({ workspace, project, sourceDir, types, dryRun, clients, scope }) => {
    const slug = project || 'default';
    const dir = sourceDir || process.cwd();
    const resolucao = await resolverSelecaoSync(dir, scope, clients);

    if (resolucao.requiresClientSelection) {
      return respostaSelecaoNecessaria(dir, scope, resolucao.availableTargets, 'push');
    }

    if (resolucao.selectedTargets.length === 0) {
      return respostaTexto(montarMensagemSemClientes(dir, scope, clients));
    }

    const importacao = await importarTargetsDetectados(
      dir,
      scope,
      [...new Set(resolucao.selectedTargets.map((target) => target.clientId))],
    );

    let itens = importacao.items;
    if (types && types.length > 0) {
      itens = itens.filter((item) => types.includes(item.type));
    }

    if (itens.length === 0) {
      return respostaTexto([
        `Nenhum conteúdo sincronizável encontrado em ${dir}.`,
        montarResumoTargets(importacao.targets),
        'O MyInst aceita apenas estruturas conhecidas por adapter e ignora caches, plugins empacotados, sessions e node_modules.',
      ].join('\n'));
    }

    if (dryRun) {
      const preview = itens.map((item) => ({ type: item.type, title: item.title, slug: item.slug }));
      return respostaTexto([
        `[DRY RUN] Origem detectada em ${dir}`,
        montarResumoTargets(importacao.targets),
        `Tipos encontrados: ${montarResumoTipos(itens)}`,
        '',
        `${itens.length} item(ns) seriam enviados:`,
        JSON.stringify(preview, null, 2),
      ].join('\n'));
    }

    const resultado = await client.push({ workspace, project: slug, items: itens });
    return respostaTexto([
      `Push concluído para projeto "${slug}" a partir de ${dir}:`,
      montarResumoTargets(importacao.targets),
      `Tipos sincronizados: ${montarResumoTipos(itens)}`,
      `  - Criados: ${resultado.created.length} (${resultado.created.join(', ') || 'nenhum'})`,
      `  - Atualizados: ${resultado.updated.length} (${resultado.updated.join(', ') || 'nenhum'})`,
    ].join('\n'));
  },
);

server.tool(
  'myinst_import',
  'Importa conteúdo de clientes conhecidos para o vault MyInst. Descobre os clientes locais, exige seleção quando houver múltiplas origens e organiza globais por pasta previsível.',
  {
    sourceDir: z.string().describe('Diretório fonte para identificar e importar estruturas conhecidas de agente'),
    workspace: z.string().describe('Slug do workspace (omita para o workspace padrão)').optional(),
    project: z.string().describe('Slug do projeto destino (omita para "default")').optional(),
    folderName: z.string().describe('Nome base da pasta destino para imports de projeto').optional(),
    dryRun: z.boolean().describe('Apenas mostra o que seria importado sem efetuar push').optional(),
    overwrite: z.boolean().describe('Sobrescrever itens existentes (padrão: false)').optional(),
    clients: z.array(z.string()).describe('Clientes a importar').optional(),
    scope: z.enum(SCOPES_SYNC).describe('Escopo de descoberta: project, global ou all').optional(),
  },
  async ({ sourceDir, workspace, project, folderName, dryRun, overwrite, clients, scope }) => {
    const slug = project || 'default';
    const resolucao = await resolverSelecaoSync(sourceDir, scope, clients);

    if (resolucao.requiresClientSelection) {
      return respostaSelecaoNecessaria(sourceDir, scope, resolucao.availableTargets, 'import');
    }

    if (resolucao.selectedTargets.length === 0) {
      return respostaTexto(montarMensagemSemClientes(sourceDir, scope, clients));
    }

    const importacao = await importarTargetsDetectados(
      sourceDir,
      scope,
      [...new Set(resolucao.selectedTargets.map((target) => target.clientId))],
    );

    if (importacao.items.length === 0) {
      return respostaTexto([
        `Nenhum conteúdo sincronizável encontrado em ${sourceDir}.`,
        montarResumoTargets(importacao.targets),
        'O MyInst procura apenas estruturas conhecidas dos clientes suportados.',
      ].join('\n'));
    }

    const nomeRepo = folderName || detectarNomeRepositorio(sourceDir);
    const grupos = agruparImportacaoPorFolder(importacao.targets, importacao.items, nomeRepo);

    if (dryRun) {
      return respostaTexto([
        `[DRY RUN] Origem detectada em ${sourceDir}`,
        montarResumoTargets(importacao.targets),
        `Tipos encontrados: ${montarResumoTipos(importacao.items)}`,
        '',
        'Pastas de destino previstas:',
        JSON.stringify(grupos.map((grupo) => ({
          folderSlug: grupo.folderSlug,
          clientId: grupo.clientId,
          scope: grupo.scope,
          itens: grupo.items.map((item) => ({ type: item.type, slug: item.slug })),
        })), null, 2),
      ].join('\n'));
    }

    const pastasExistentes = await client.listarPastas(slug, workspace);
    const existentes = await client.pull({ workspace, project: slug });
    const slugsExistentes = new Set(existentes.items.map((item) => `${item.type}:${item.slug}`));
    const linhas = [`Import concluído para projeto "${slug}" a partir de ${sourceDir}:`, montarResumoTargets(importacao.targets)];

    for (const grupo of grupos) {
      if (!pastasExistentes.some((pasta) => pasta.slug === grupo.folderSlug)) {
        await client.criarPasta(slug, { name: formatarNomePasta(grupo.folderSlug), slug: grupo.folderSlug }, workspace);
        pastasExistentes.push({
          id: grupo.folderSlug,
          name: formatarNomePasta(grupo.folderSlug),
          slug: grupo.folderSlug,
        });
      }

      const paraEnviar: ItemSincronizavel[] = [];
      const ignorados: ItemSincronizavel[] = [];

      for (const item of grupo.items) {
        const chave = `${item.type}:${item.slug}`;
        if (slugsExistentes.has(chave) && !overwrite) {
          ignorados.push(item);
          continue;
        }

        paraEnviar.push(item);
      }

      if (paraEnviar.length === 0) {
        linhas.push(`  - ${grupo.folderSlug}: nenhum item novo (${ignorados.length} conflito(s))`);
        continue;
      }

      const resultado = await client.push({
        workspace,
        project: slug,
        folderSlug: grupo.folderSlug,
        items: paraEnviar,
      });

      for (const item of paraEnviar) {
        slugsExistentes.add(`${item.type}:${item.slug}`);
      }

      linhas.push(
        `  - ${grupo.folderSlug}: ${paraEnviar.length} item(ns) importados (${montarResumoTipos(paraEnviar)})`,
        `    criados=${resultado.created.length}, atualizados=${resultado.updated.length}, ignorados=${ignorados.length}`,
      );
    }

    return respostaTexto(linhas.join('\n'));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

function normalizarItensVault(items: Array<{
  type: string;
  slug: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}>) {
  return items
    .filter((item): item is ItemSincronizavel => TIPOS_CANONICOS.includes(item.type as TipoSincronizavel))
    .map((item) => ({
      type: item.type as TipoSincronizavel,
      slug: item.slug,
      title: item.title,
      body: item.body,
      metadata: item.metadata,
      tags: item.tags,
    }));
}

function agruparImportacaoPorFolder(targets: SyncTarget[], items: ItemSincronizavel[], folderBase: string) {
  const grupos = new Map<string, {
    folderSlug: string;
    clientId: string;
    scope: SyncTarget['scope'];
    items: ItemSincronizavel[];
  }>();

  for (const target of targets) {
    const folderSlug = target.scope === 'global' ? `${target.clientId}-global` : folderBase;
    const key = `${target.clientId}:${target.scope}:${folderSlug}`;
    const grupoAtual = grupos.get(key);

    if (!grupoAtual) {
      grupos.set(key, {
        folderSlug,
        clientId: target.clientId,
        scope: target.scope,
        items: filtrarItensPorCliente(items, target.clientId),
      });
      continue;
    }

    grupoAtual.items = deduplicarItens([...grupoAtual.items, ...filtrarItensPorCliente(items, target.clientId)]);
  }

  return [...grupos.values()].filter((grupo) => grupo.items.length > 0);
}

function filtrarItensPorCliente(items: ItemSincronizavel[], clientId: string) {
  if (clientId === 'claude' || clientId === 'codex') {
    return items;
  }

  if (clientId === 'cursor' || clientId === 'opencode' || clientId === 'aider' || clientId === 'antigravity') {
    return items.filter((item) => item.type === 'instruction' || item.type === 'mcp_config');
  }

  return items.filter((item) => item.type === 'instruction');
}

function deduplicarItens(items: ItemSincronizavel[]) {
  const mapa = new Map<string, ItemSincronizavel>();
  for (const item of items) {
    mapa.set(`${item.type}:${item.slug}`, item);
  }
  return [...mapa.values()];
}

function montarResumoTipos(itens: Array<{ type: string }>) {
  const contagemPorTipo = new Map<string, number>();

  for (const item of itens) {
    const quantidadeAtual = contagemPorTipo.get(item.type) ?? 0;
    contagemPorTipo.set(item.type, quantidadeAtual + 1);
  }

  return [...contagemPorTipo.entries()]
    .map(([tipo, quantidade]) => `${tipo}: ${quantidade}`)
    .join(', ');
}

function montarResumoTargets(targets: SyncTarget[]) {
  if (targets.length === 0) {
    return 'Clientes detectados: nenhum';
  }

  return [
    'Clientes detectados:',
    ...targets.map((target) => {
      const descricaoEscopo = target.scope === 'global'
        ? 'configuração global do cliente, compartilhada entre todos os projetos'
        : 'configuração de projeto encontrada dentro do diretório analisado';

      return `  - ${target.clientId} (${target.clientName}) [${target.scope}] ${descricaoEscopo}; suporte=${target.supportLevel}; tipos=${target.supportedTypes.join(', ')}; paths=${target.detectedPaths.join(', ')}; itens≈${target.estimatedItemCount}`;
    }),
  ].join('\n');
}

function montarResumoEscritaNativa(results: EscritaCliente[]) {
  return results.map((result) => {
    const linhas = [
      `${result.clientName} [${result.scope}]`,
      `  - escritos: ${result.written.length}`,
    ];

    if (result.written.length > 0) {
      for (const item of result.written) {
        linhas.push(`    - [${item.type}] ${item.slug} → ${item.path}`);
      }
    }

    if (result.ignored.length > 0) {
      linhas.push(`  - ignorados: ${result.ignored.length}`);
      for (const item of result.ignored) {
        linhas.push(`    - [${item.type}] ${item.slug}: ${item.reason}`);
      }
    }

    return linhas.join('\n');
  }).join('\n\n');
}

function montarResumoDryRunNative(
  targets: SyncTarget[],
  items: Array<{ type: string; slug: string }>,
) {
  return targets.map((target) => {
    const tiposSuportados = new Set(target.supportedTypes);
    const compativeis = items.filter((item) => tiposSuportados.has(item.type as TipoSincronizavel));
    const ignorados = items.filter((item) => !tiposSuportados.has(item.type as TipoSincronizavel));

    return [
      `${target.clientName} [${target.scope}]`,
      `  - tipos suportados: ${target.supportedTypes.join(', ')}`,
      `  - itens compatíveis: ${compativeis.length}`,
      `  - itens ignorados por falta de suporte: ${ignorados.length}`,
    ].join('\n');
  }).join('\n\n');
}

function respostaSelecaoNecessaria(
  dir: string,
  scope: EscopoSync | undefined,
  targets: SyncTarget[],
  operacao: 'import' | 'push' | 'pull',
  complemento?: string,
) {
  const comando = operacao === 'pull'
    ? `Repita myinst_pull com clients: ["${targets[0]?.clientId ?? 'claude'}"]${complemento ? ` e ${complemento}` : ''}.`
    : `Repita myinst_${operacao} com clients: ["${targets[0]?.clientId ?? 'claude'}"].`;

  return {
    content: [{
      type: 'text' as const,
      text: [
        `Mais de um cliente sincronizável foi detectado em ${dir}.`,
        `Escopo considerado: ${scope || 'all'}`,
        montarResumoTargets(targets),
        '',
        comando,
      ].join('\n'),
    }],
  };
}

function montarMensagemSemClientes(dir: string, scope: EscopoSync | undefined, clients?: string[]) {
  return [
    `Nenhum cliente sincronizável foi detectado em ${dir}.`,
    `Escopo considerado: ${scope || 'all'}`,
    clients?.length ? `Filtro de clientes: ${clients.join(', ')}` : 'Filtro de clientes: nenhum',
    'Use myinst_list_sync_targets para inspecionar os paths reconhecidos antes de sincronizar.',
  ].join('\n');
}

function formatarNomePasta(folderSlug: string) {
  return folderSlug
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

async function preverAcaoGuiaMyInst(dir: string, strategy: ConflictStrategy) {
  const { access, constants, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const caminho = join(dir, '.claude', 'MYINST.md');

  try {
    await access(caminho, constants.F_OK);
  } catch {
    return 'criado';
  }

  const conteudoAtual = await readFile(caminho, 'utf-8');
  if (conteudoAtual.includes('<!-- myinst-managed: true -->')) {
    return 'atualizado';
  }

  if (strategy === 'skip') {
    return 'ignorado';
  }

  return 'criado como conflito controlado em .claude/vault-MYINST.md';
}

function respostaTexto(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}
