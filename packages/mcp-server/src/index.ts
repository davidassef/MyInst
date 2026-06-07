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

    const carregamento = await carregarItensParaPull({
      dir,
      workspace,
      project,
      types,
      tags: tagsFinais,
      scope,
      clients,
    });
    if (carregamento.selecaoNecessaria) {
      return respostaSelecaoNecessaria(dir, scope, carregamento.availableTargets, 'pull', 'targetFormat: "native"');
    }

    if (carregamento.items.length === 0) {
      return respostaTexto('Nenhum item encontrado para o escopo solicitado.');
    }

    if (formato === 'myinst') {
      if (dryRun) {
        return respostaTexto([
          montarResumoPullOrigem(carregamento),
          '',
          montarPreviewPull(carregamento.items),
          '',
          `.claude/MYINST.md também seria ${await preverAcaoGuiaMyInst(dir, strategy)}.`,
        ].join('\n'));
      }

      const aplicados = await aplicarConteudo(carregamento.items, dir, strategy);
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

    if (carregamento.targets.length === 0) {
      return respostaTexto(montarMensagemSemClientes(dir, scope, clients));
    }

    const exportacao = await exportarParaClientesNativos(
      dir,
      normalizarItensVault(carregamento.items),
      scope,
      [...new Set(carregamento.targets.map((target) => target.clientId))],
    );

      if (dryRun) {
      return respostaTexto([
        `[DRY RUN] Exportação nativa para ${dir}`,
        montarResumoPullOrigem(carregamento),
        montarResumoTargets(exportacao.targets),
        montarResumoDryRunNative(exportacao.targets, carregamento.items),
      ].join('\n\n'));
    }

    return respostaTexto([
      `Pull nativo concluído em ${dir}.`,
      montarResumoPullOrigem(carregamento),
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
    scope: z.enum(SCOPES_SYNC).describe('Escopo da busca: project, global ou all').optional(),
    clientId: z.string().describe('Client profile global específico para a busca').optional(),
  },
  async ({ workspace, project, query, type, scope, clientId }) => {
    const filtrados = await client.buscarConteudo({ query, workspace, project, type, scope, clientId });

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
          sourceScope: item.source_scope,
          clientId: item.client_id,
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
    scope: z.enum(SCOPES_SYNC).describe('Escopo da verificação: project, global ou all').optional(),
    clientId: z.string().describe('Client profile global específico para status').optional(),
  },
  async ({ workspace, project, since, scope, clientId }) => {
    if (scope === 'global') {
      if (!clientId) {
        return respostaTexto('clientId é obrigatório para myinst_status com scope=global');
      }

      const statusGlobal = await client.statusGlobal(clientId, since);
      return respostaTexto(`${statusGlobal.changedCount} item(ns) globais alterado(s) em ${clientId} desde ${since || 'sempre'}:\n${JSON.stringify(statusGlobal.items, null, 2)}`);
    }

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

    const itensTratados = separarItensSincronizaveis(importacao.items, types);
    const gruposEscopo = separarItensPorEscopo(itensTratados.sincronizaveis);
    const itens = [...gruposEscopo.projectItems, ...gruposEscopo.globalItems];

    if (itens.length === 0) {
      return respostaTexto(montarMensagemSemItensSincronizaveis({
        dir,
        targets: importacao.targets,
        ignoradosCompartilhados: itensTratados.ignoradosCompartilhados,
        contexto: 'push',
      }));
    }

    const projetoDestino = gruposEscopo.projectItems.length > 0
      ? await resolverProjetoDestinoSync({
          client,
          workspace,
          project,
          sourceDir: dir,
          selectedTargets: resolucao.selectedTargets.filter((target) => target.scope === 'project'),
          dryRun,
        })
      : null;

    if (dryRun) {
      const preview = itens.map((item) => ({ type: item.type, title: item.title, slug: item.slug }));
      return respostaTexto([
        `[DRY RUN] Origem detectada em ${dir}`,
        ...(projetoDestino ? [montarResumoProjetoDestino(projetoDestino)] : []),
        montarResumoTargets(importacao.targets),
        `Tipos encontrados: ${montarResumoTipos(itens)}`,
        montarResumoEscoposSync(gruposEscopo),
        montarResumoIgnoradosCompartilhados(itensTratados.ignoradosCompartilhados),
        '',
        `${itens.length} item(ns) seriam enviados:`,
        JSON.stringify(preview, null, 2),
      ].filter(Boolean).join('\n'));
    }

    const linhas = [
      `Push concluído a partir de ${dir}:`,
      ...(projetoDestino ? [montarResumoProjetoDestino(projetoDestino)] : []),
      montarResumoTargets(importacao.targets),
      `Tipos sincronizados: ${montarResumoTipos(itens)}`,
      montarResumoEscoposSync(gruposEscopo),
      montarResumoIgnoradosCompartilhados(itensTratados.ignoradosCompartilhados),
    ].filter(Boolean);

    if (gruposEscopo.projectItems.length > 0 && projetoDestino) {
      const resultadoProjeto = await client.push({ workspace, project: projetoDestino.slug, items: gruposEscopo.projectItems });
      linhas.push(
        `  - Projeto ${projetoDestino.slug}: criados=${resultadoProjeto.created.length}, atualizados=${resultadoProjeto.updated.length}`,
      );
    }

    for (const [clientId, itensGlobais] of Object.entries(gruposEscopo.globalByClient)) {
      const resultadoGlobal = await client.push({ scope: 'global', clientId, items: itensGlobais });
      linhas.push(
        `  - Global ${clientId}: criados=${resultadoGlobal.created.length}, atualizados=${resultadoGlobal.updated.length}`,
      );
    }

    return respostaTexto(linhas.join('\n'));
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

    const itensTratados = separarItensSincronizaveis(importacao.items);
    if (itensTratados.sincronizaveis.length === 0) {
      return respostaTexto(montarMensagemSemItensSincronizaveis({
        dir: sourceDir,
        targets: importacao.targets,
        ignoradosCompartilhados: itensTratados.ignoradosCompartilhados,
        contexto: 'import',
      }));
    }

    const gruposEscopo = separarItensPorEscopo(itensTratados.sincronizaveis);
    const projetoDestino = gruposEscopo.projectItems.length > 0
      ? await resolverProjetoDestinoSync({
          client,
          workspace,
          project,
          sourceDir,
          selectedTargets: resolucao.selectedTargets.filter((target) => target.scope === 'project'),
          dryRun,
        })
      : null;
    const slug = projetoDestino?.slug;

    const nomeRepo = folderName || detectarNomeRepositorio(sourceDir);
    const gruposProjeto = agruparImportacaoPorFolder(
      importacao.targets.filter((target) => target.scope === 'project'),
      gruposEscopo.projectItems,
      nomeRepo,
    );

    if (dryRun) {
      return respostaTexto([
        `[DRY RUN] Origem detectada em ${sourceDir}`,
        ...(projetoDestino ? [montarResumoProjetoDestino(projetoDestino)] : []),
        montarResumoTargets(importacao.targets),
        `Tipos encontrados: ${montarResumoTipos(itensTratados.sincronizaveis)}`,
        montarResumoEscoposSync(gruposEscopo),
        montarResumoIgnoradosCompartilhados(itensTratados.ignoradosCompartilhados),
        '',
        'Pastas de destino previstas:',
        JSON.stringify([
          ...gruposProjeto.map((grupo) => ({
            folderSlug: grupo.folderSlug,
            clientId: grupo.clientId,
            scope: grupo.scope,
            itens: grupo.items.map((item) => ({ type: item.type, slug: item.slug })),
          })),
          ...Object.entries(gruposEscopo.globalByClient).map(([clientId, itensGlobais]) => ({
            clientId,
            scope: 'global',
            itens: itensGlobais.map((item) => ({ type: item.type, slug: item.slug })),
          })),
        ], null, 2),
      ].filter(Boolean).join('\n'));
    }

    const linhas = [
      `Import concluído a partir de ${sourceDir}:`,
      ...(projetoDestino ? [montarResumoProjetoDestino(projetoDestino)] : []),
      montarResumoTargets(importacao.targets),
      montarResumoEscoposSync(gruposEscopo),
    ];

    if (itensTratados.ignoradosCompartilhados.length > 0) {
      linhas.push(montarResumoIgnoradosCompartilhados(itensTratados.ignoradosCompartilhados));
    }

    if (slug) {
      const pastasExistentes = await client.listarPastas(slug, workspace);
      const existentes = await client.pull({ workspace, project: slug });
      const slugsExistentes = new Set(existentes.items.map((item) => `${item.type}:${item.slug}`));

      for (const grupo of gruposProjeto) {
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
    }

    for (const [clientId, itensGlobais] of Object.entries(gruposEscopo.globalByClient)) {
      const existentesGlobais = await client.pull({ scope: 'global', clientId });
      const slugsExistentesGlobais = new Set(existentesGlobais.items.map((item) => `${item.type}:${item.slug}`));
      const paraEnviar = overwrite
        ? itensGlobais
        : itensGlobais.filter((item) => !slugsExistentesGlobais.has(`${item.type}:${item.slug}`));
      const ignorados = itensGlobais.length - paraEnviar.length;

      if (paraEnviar.length === 0) {
        linhas.push(`  - ${clientId} global: nenhum item novo (${ignorados} conflito(s))`);
        continue;
      }

      const resultado = await client.push({ scope: 'global', clientId, items: paraEnviar });
      linhas.push(
        `  - ${clientId} global: ${paraEnviar.length} item(ns) importados (${montarResumoTipos(paraEnviar)})`,
        `    criados=${resultado.created.length}, atualizados=${resultado.updated.length}, ignorados=${ignorados}`,
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

async function carregarItensParaPull({
  dir,
  workspace,
  project,
  types,
  tags,
  scope,
  clients,
}: {
  dir: string;
  workspace?: string;
  project?: string;
  types?: string[];
  tags?: string[];
  scope?: EscopoSync;
  clients?: string[];
}) {
  const scopeFinal = scope || 'project';
  const items: Array<{
    id: string;
    type: string;
    slug: string;
    title: string;
    description: string | null;
    body: string;
    metadata: Record<string, unknown>;
    tags: string[];
  }> = [];
  const availableTargets = await listarSyncTargets(dir, scopeFinal, clients);
  const requiresClientSelection = !clients?.length && new Set(availableTargets.map((target) => target.clientId)).size > 1 && scopeFinal !== 'project';

  if (requiresClientSelection) {
    return {
      items: [],
      targets: [],
      selecaoNecessaria: true,
      availableTargets,
      sources: [] as string[],
    };
  }

  if (scopeFinal !== 'global') {
    const resultadoProjeto = await client.pull({
      workspace,
      project: project || 'default',
      types,
      tags: tags?.length ? tags : undefined,
    });
    items.push(...resultadoProjeto.items.map((item) => ({
      ...item,
      id: item.id,
      description: item.description ?? null,
    })));
  }

  const clientIdsGlobais = clients?.length
    ? clients
    : availableTargets.filter((target) => target.scope === 'global').map((target) => target.clientId);

  if (scopeFinal !== 'project') {
    for (const clientId of [...new Set(clientIdsGlobais)]) {
      const resultadoGlobal = await client.pull({
        scope: 'global',
        clientId,
        types,
        tags: tags?.length ? tags : undefined,
      });
      items.push(...resultadoGlobal.items.map((item) => ({
        ...item,
        id: item.id || `${clientId}:${item.type}:${item.slug}`,
        description: item.description ?? null,
        metadata: {
          ...item.metadata,
          myinstClientId: clientId,
          myinstSourceScope: 'global',
        },
      })));
    }
  }

  return {
    items,
    targets: availableTargets.filter((target) => scopeFinal === 'all' || target.scope === scopeFinal),
    selecaoNecessaria: false,
    availableTargets,
    sources: [
      ...(scopeFinal !== 'global' ? [`projeto:${project || 'default'}`] : []),
      ...(scopeFinal !== 'project' ? [...new Set(clientIdsGlobais)].map((clientId) => `global:${clientId}`) : []),
    ],
  };
}

async function resolverProjetoDestinoSync({
  client,
  workspace,
  project,
  sourceDir,
  selectedTargets,
  dryRun,
}: {
  client: MyInstClient;
  workspace?: string;
  project?: string;
  sourceDir: string;
  selectedTargets: SyncTarget[];
  dryRun?: boolean;
}) {
  if (project) {
    return {
      slug: project,
      name: formatarNomePasta(project),
      created: false,
      automatic: false,
    };
  }

  const possuiEscopoProjeto = selectedTargets.some((target) => target.scope === 'project');
  if (!possuiEscopoProjeto) {
    return {
      slug: 'default',
      name: 'Default',
      created: false,
      automatic: false,
    };
  }

  const slugDerivado = detectarNomeRepositorio(sourceDir);
  const nomeDerivado = formatarNomePasta(slugDerivado);
  const projetos = await client.listarProjetosDoWorkspace(workspace);
  const existente = projetos.find((projetoAtual) => projetoAtual.slug === slugDerivado);

  if (existente) {
    return {
      slug: existente.slug,
      name: existente.name,
      created: false,
      automatic: true,
    };
  }

  if (dryRun) {
    return {
      slug: slugDerivado,
      name: nomeDerivado,
      created: false,
      automatic: true,
      wouldCreate: true,
    };
  }

  await client.criarProjeto({
    name: nomeDerivado,
    slug: slugDerivado,
    description: `Projeto sincronizado automaticamente a partir de ${sourceDir}`,
  }, workspace);

  return {
    slug: slugDerivado,
    name: nomeDerivado,
    created: true,
    automatic: true,
    wouldCreate: false,
  };
}

function montarResumoProjetoDestino(projetoDestino: {
  slug: string;
  name: string;
  created: boolean;
  automatic: boolean;
  wouldCreate?: boolean;
}) {
  if (!projetoDestino.automatic) {
    return `Projeto destino: ${projetoDestino.slug}`;
  }

  if (projetoDestino.wouldCreate) {
    return `Projeto destino: ${projetoDestino.slug} (${projetoDestino.name}) seria criado automaticamente a partir do repositório local`;
  }

  if (projetoDestino.created) {
    return `Projeto destino: ${projetoDestino.slug} (${projetoDestino.name}) criado automaticamente a partir do repositório local`;
  }

  return `Projeto destino: ${projetoDestino.slug} (${projetoDestino.name}) resolvido automaticamente a partir do repositório local`;
}

function separarItensSincronizaveis(
  items: ItemSincronizavel[],
  types?: string[],
) {
  const ignoradosCompartilhados = items.filter((item) => {
    const categoria = item.metadata?.myinstSourceCategory;
    const tipoCompativel = !types || types.includes(item.type);
    return categoria === 'shared_materialized' && tipoCompativel;
  });

  const sincronizaveis = items.filter((item) => item.metadata?.myinstSourceCategory !== 'shared_materialized');

  return {
    sincronizaveis,
    ignoradosCompartilhados,
  };
}

function separarItensPorEscopo(items: ItemSincronizavel[]) {
  const projectItems: ItemSincronizavel[] = [];
  const globalItems: ItemSincronizavel[] = [];
  const globalByClient: Record<string, ItemSincronizavel[]> = {};

  for (const item of items) {
    const escopo = item.metadata?.myinstSourceScope;
    const clientId = typeof item.metadata?.myinstClientId === 'string' ? item.metadata.myinstClientId : 'unknown';

    if (escopo === 'global') {
      globalItems.push(item);
      globalByClient[clientId] ||= [];
      globalByClient[clientId].push(item);
      continue;
    }

    projectItems.push(item);
  }

  return {
    projectItems,
    globalItems,
    globalByClient,
  };
}

function montarResumoEscoposSync(grupos: {
  projectItems: ItemSincronizavel[];
  globalItems: ItemSincronizavel[];
  globalByClient: Record<string, ItemSincronizavel[]>;
}) {
  const linhas = [
    `Escopo projeto: ${grupos.projectItems.length} item(ns)`,
    `Escopo global: ${grupos.globalItems.length} item(ns)`,
  ];

  for (const [clientId, itens] of Object.entries(grupos.globalByClient)) {
    linhas.push(`  - ${clientId}: ${itens.length} item(ns) globais`);
  }

  return linhas.join('\n');
}

function montarResumoPullOrigem(carregamento: { sources: string[] }) {
  return `Origens do pull: ${carregamento.sources.join(', ')}`;
}

function montarResumoIgnoradosCompartilhados(itens: ItemSincronizavel[]) {
  if (itens.length === 0) return '';

  return `Itens ignorados por parecerem skills compartilhadas materializadas no projeto: ${itens.length} (${itens.map((item) => item.slug).join(', ')})`;
}

function montarMensagemSemItensSincronizaveis({
  dir,
  targets,
  ignoradosCompartilhados,
  contexto,
}: {
  dir: string;
  targets: SyncTarget[];
  ignoradosCompartilhados: ItemSincronizavel[];
  contexto: 'push' | 'import';
}) {
  const mensagemBase = contexto === 'push'
    ? 'O MyInst aceita apenas estruturas conhecidas por adapter e ignora caches, plugins empacotados, sessions e node_modules.'
    : 'O MyInst procura apenas estruturas conhecidas dos clientes suportados.';

  return [
    `Nenhum conteúdo sincronizável encontrado em ${dir}.`,
    montarResumoTargets(targets),
    montarResumoIgnoradosCompartilhados(ignoradosCompartilhados),
    mensagemBase,
  ].filter(Boolean).join('\n');
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
