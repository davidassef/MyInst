import { access, constants, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

export type TipoSincronizavel =
  | 'skill'
  | 'instruction'
  | 'mcp_config'
  | 'agent'
  | 'hook'
  | 'memory'
  | 'snippet';

export type EscopoSync = 'project' | 'global' | 'all';
export type NivelSuporte = 'full' | 'partial' | 'experimental';
export type FormatoPull = 'myinst' | 'native';

export interface ItemSincronizavel {
  type: TipoSincronizavel;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface SyncTarget {
  clientId: string;
  clientName: string;
  supportLevel: NivelSuporte;
  scope: 'project' | 'global';
  detectedPaths: string[];
  supportedTypes: TipoSincronizavel[];
  estimatedItemCount: number;
}

export interface ResolucaoSync {
  selectedTargets: SyncTarget[];
  requiresClientSelection: boolean;
  availableTargets: SyncTarget[];
}

interface ClienteAdapter {
  id: string;
  nome: string;
  nivelSuporte: NivelSuporte;
  escopoSuportado: EscopoSync;
  tiposSuportados: TipoSincronizavel[];
  detectar: (ctx: ContextoSync, scope: EscopoSync) => Promise<SyncTarget[]>;
  ler: (target: SyncTarget) => Promise<ItemSincronizavel[]>;
  escrever: (items: ItemSincronizavel[], target: SyncTarget) => Promise<EscritaCliente>;
}

export interface EscritaCliente {
  clientId: string;
  clientName: string;
  scope: 'project' | 'global';
  written: Array<{ path: string; type: TipoSincronizavel; slug: string }>;
  ignored: Array<{ type: TipoSincronizavel; slug: string; reason: string }>;
}

interface ContextoSync {
  projectDir: string;
  userHome: string;
  env: NodeJS.ProcessEnv;
}

const TIPOS_FULL: TipoSincronizavel[] = ['skill', 'instruction', 'mcp_config', 'agent', 'hook', 'memory', 'snippet'];
const TIPOS_PARTIAL: TipoSincronizavel[] = ['instruction', 'mcp_config'];
const DIRETORIOS_IGNORADOS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'cache',
  'plugins',
  'attachments',
  'sessions',
  'browser',
  'computer-use',
  'memories',
  'node_repl',
  'sqlite',
  'tmp',
  '.tmp',
  '.sandbox',
  '.sandbox-bin',
  '.sandbox-secrets',
  'vendor_imports',
  'generated_images',
  'ambient-suggestions',
  'process_manager',
  'pets',
]);

const ADAPTERS: ClienteAdapter[] = [
  criarAdapterClaude(),
  criarAdapterCodex(),
  criarAdapterCursor(),
  criarAdapterGemini(),
  criarAdapterOpenCode(),
  criarAdapterQwen(),
  criarAdapterAider(),
  criarAdapterAntigravity(),
];

export async function listarSyncTargets(
  projectDir: string,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<SyncTarget[]> {
  const ctx = criarContextoSync(projectDir);
  const permitidos = clients?.length ? new Set(clients) : null;
  const targets: SyncTarget[] = [];

  for (const adapter of ADAPTERS) {
    if (permitidos && !permitidos.has(adapter.id)) continue;
    const encontrados = await adapter.detectar(ctx, scope);
    targets.push(...encontrados);
  }

  return targets.sort((a, b) => `${a.clientId}:${a.scope}`.localeCompare(`${b.clientId}:${b.scope}`));
}

export async function resolverSelecaoSync(
  projectDir: string,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<ResolucaoSync> {
  const availableTargets = await listarSyncTargets(projectDir, scope);

  if (clients?.length) {
    return {
      selectedTargets: availableTargets.filter((target) => clients.includes(target.clientId)),
      requiresClientSelection: false,
      availableTargets,
    };
  }

  const clientesEncontrados = new Set(availableTargets.map((target) => target.clientId));
  if (clientesEncontrados.size > 1) {
    return {
      selectedTargets: [],
      requiresClientSelection: true,
      availableTargets,
    };
  }

  return {
    selectedTargets: availableTargets,
    requiresClientSelection: false,
    availableTargets,
  };
}

export async function importarTargetsDetectados(
  projectDir: string,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<{ targets: SyncTarget[]; items: ItemSincronizavel[] }> {
  const targets = await listarSyncTargets(projectDir, scope, clients);
  const items = new Map<string, ItemSincronizavel>();

  for (const target of targets) {
    const adapter = obterAdapter(target.clientId);
    const lidos = await adapter.ler(target);

    for (const item of lidos) {
      items.set(`${target.clientId}:${target.scope}:${item.type}:${item.slug}`, item);
    }
  }

  return {
    targets,
    items: [...items.values()],
  };
}

export async function exportarParaClientesNativos(
  projectDir: string,
  items: Array<{ type: string; slug: string; title: string; body: string; metadata: Record<string, unknown>; tags: string[] }>,
  scope: EscopoSync = 'all',
  clients?: string[],
): Promise<{ targets: SyncTarget[]; results: EscritaCliente[] }> {
  const targets = await listarSyncTargets(projectDir, scope, clients);
  const itemsValidos = items
    .filter((item): item is ItemSincronizavel => TIPOS_FULL.includes(item.type as TipoSincronizavel))
    .map((item) => ({ ...item, type: item.type as TipoSincronizavel }));
  const results: EscritaCliente[] = [];

  for (const target of targets) {
    const adapter = obterAdapter(target.clientId);
    const resultado = await adapter.escrever(itemsValidos, target);
    results.push(resultado);
  }

  return { targets, results };
}

export function obterClientesSuportados() {
  return ADAPTERS.map((adapter) => ({
    id: adapter.id,
    nome: adapter.nome,
    nivelSuporte: adapter.nivelSuporte,
    escopoSuportado: adapter.escopoSuportado,
    tiposSuportados: adapter.tiposSuportados,
  }));
}

function criarContextoSync(projectDir: string): ContextoSync {
  return {
    projectDir: resolve(projectDir),
    userHome: homedir(),
    env: process.env,
  };
}

function obterAdapter(clientId: string) {
  const adapter = ADAPTERS.find((entry) => entry.id === clientId);
  if (!adapter) {
    throw new Error(`Adapter MCP desconhecido: ${clientId}`);
  }

  return adapter;
}

function criarAdapterClaude(): ClienteAdapter {
  return {
    id: 'claude',
    nome: 'Claude Code',
    nivelSuporte: 'full',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_FULL,
    detectar: async (ctx, scope) => {
      if (scope === 'global') return [];

      const base = join(ctx.projectDir, '.claude');
      const encontrados = await filtrarExistentes([
        join(base, 'skills'),
        join(base, 'agents'),
        join(base, 'memory'),
        join(base, 'snippets'),
        join(base, 'hooks'),
        join(base, 'CLAUDE.md'),
        join(base, '.mcp.json'),
      ]);

      if (encontrados.length === 0) return [];

      return [{
        clientId: 'claude',
        clientName: 'Claude Code',
        supportLevel: 'full',
        scope: 'project',
        detectedPaths: encontrados,
        supportedTypes: TIPOS_FULL,
        estimatedItemCount: await contarArquivosMarkdown(join(base, 'skills'))
          + await contarArquivosMarkdown(join(base, 'agents'))
          + await contarArquivosMarkdown(join(base, 'memory'))
          + await contarArquivosMarkdown(join(base, 'snippets'))
          + await contarArquivosMarkdown(join(base, 'hooks'))
          + (await existe(join(base, 'CLAUDE.md')) ? 1 : 0)
          + (await existe(join(base, '.mcp.json')) ? 1 : 0),
      }];
    },
    ler: async (target) => {
      const raizProjeto = dirname(dirname(target.detectedPaths[0] ?? join(process.cwd(), '.claude', 'skills')));
      return lerEstruturaClaude(raizProjeto);
    },
    escrever: async (items, target) => escreverEstruturaClaude(items, target),
  };
}

function criarAdapterCodex(): ClienteAdapter {
  return {
    id: 'codex',
    nome: 'Codex',
    nivelSuporte: 'full',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_FULL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        const baseProjeto = join(ctx.projectDir, '.codex');
        const encontradosProjeto = await filtrarExistentes([
          join(baseProjeto, 'skills'),
          join(baseProjeto, 'AGENTS.md'),
          join(baseProjeto, '.mcp.json'),
          join(ctx.projectDir, 'AGENTS.md'),
          join(ctx.projectDir, '.mcp.json'),
        ]);

        if (encontradosProjeto.length > 0) {
          targets.push({
            clientId: 'codex',
            clientName: 'Codex',
            supportLevel: 'full',
            scope: 'project',
            detectedPaths: encontradosProjeto,
            supportedTypes: TIPOS_FULL,
            estimatedItemCount: await contarSkillsCodex(join(baseProjeto, 'skills'))
              + (await existe(join(baseProjeto, 'AGENTS.md')) ? 1 : 0)
              + (await existe(join(baseProjeto, '.mcp.json')) ? 1 : 0)
              + (await existe(join(ctx.projectDir, 'AGENTS.md')) ? 1 : 0)
              + (await existe(join(ctx.projectDir, '.mcp.json')) ? 1 : 0),
          });
        }
      }

      if (scope !== 'project') {
        const baseGlobal = join(ctx.userHome, '.codex');
        const encontradosGlobal = await filtrarExistentes([
          join(baseGlobal, 'skills'),
          join(baseGlobal, 'AGENTS.md'),
          join(baseGlobal, 'config.toml'),
        ]);

        if (encontradosGlobal.length > 0) {
          targets.push({
            clientId: 'codex',
            clientName: 'Codex',
            supportLevel: 'full',
            scope: 'global',
            detectedPaths: encontradosGlobal,
            supportedTypes: ['skill', 'instruction', 'mcp_config'],
            estimatedItemCount: await contarSkillsCodex(join(baseGlobal, 'skills'))
              + (await existe(join(baseGlobal, 'AGENTS.md')) ? 1 : 0)
              + (await existe(join(baseGlobal, 'config.toml')) ? 1 : 0),
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      const base = target.scope === 'global'
        ? join(homedir(), '.codex')
        : resolverRaizProjetoPorPath(target.detectedPaths[0]);

      return lerEstruturaCodex(base, target.scope === 'global');
    },
    escrever: async (items, target) => escreverEstruturaCodex(items, target),
  };
}

function criarAdapterCursor(): ClienteAdapter {
  return {
    id: 'cursor',
    nome: 'Cursor',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_PARTIAL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        const base = join(ctx.projectDir, '.cursor');
        const encontrados = await filtrarExistentes([
          join(base, 'rules'),
          join(base, 'mcp.json'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'cursor',
            clientName: 'Cursor',
            supportLevel: 'partial',
            scope: 'project',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_PARTIAL,
            estimatedItemCount: await contarArquivosPorExtensao(join(base, 'rules'), ['.mdc', '.md'])
              + (await existe(join(base, 'mcp.json')) ? 1 : 0),
          });
        }
      }

      if (scope !== 'project') {
        const base = join(ctx.userHome, '.cursor');
        const encontrados = await filtrarExistentes([
          join(base, 'rules'),
          join(base, 'mcp.json'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'cursor',
            clientName: 'Cursor',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_PARTIAL,
            estimatedItemCount: await contarArquivosPorExtensao(join(base, 'rules'), ['.mdc', '.md'])
              + (await existe(join(base, 'mcp.json')) ? 1 : 0),
          });
        }
      }

      return targets;
    },
    ler: async (target) => lerEstruturaCursor(resolverBaseOculta(target, '.cursor')),
    escrever: async (items, target) => escreverEstruturaCursor(items, target),
  };
}

function criarAdapterGemini(): ClienteAdapter {
  return {
    id: 'gemini',
    nome: 'Gemini CLI',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: ['instruction'],
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        const caminhoProjeto = join(ctx.projectDir, 'GEMINI.md');
        if (await existe(caminhoProjeto)) {
          targets.push({
            clientId: 'gemini',
            clientName: 'Gemini CLI',
            supportLevel: 'partial',
            scope: 'project',
            detectedPaths: [caminhoProjeto],
            supportedTypes: ['instruction'],
            estimatedItemCount: 1,
          });
        }
      }

      if (scope !== 'project') {
        const raizGlobal = ctx.env.GEMINI_CLI_HOME
          ? resolve(ctx.env.GEMINI_CLI_HOME)
          : join(ctx.userHome, '.gemini');
        const caminhoGlobal = join(raizGlobal, 'GEMINI.md');

        if (await existe(caminhoGlobal)) {
          targets.push({
            clientId: 'gemini',
            clientName: 'Gemini CLI',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: [caminhoGlobal],
            supportedTypes: ['instruction'],
            estimatedItemCount: 1,
          });
        }
      }

      return targets;
    },
    ler: async (target) => lerArquivosEspecificos([
      { path: target.detectedPaths[0], slug: 'gemini', type: 'instruction' },
    ]),
    escrever: async (items, target) => escreverArquivoUnico(items, target, 'instruction', obterCaminhoGemini),
  };
}

function criarAdapterOpenCode(): ClienteAdapter {
  return {
    id: 'opencode',
    nome: 'OpenCode',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_PARTIAL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        const encontrados = await filtrarExistentes([
          join(ctx.projectDir, 'AGENTS.md'),
          join(ctx.projectDir, 'opencode.json'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'opencode',
            clientName: 'OpenCode',
            supportLevel: 'partial',
            scope: 'project',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_PARTIAL,
            estimatedItemCount: encontrados.length,
          });
        }
      }

      if (scope !== 'project') {
        const base = join(ctx.userHome, '.config', 'opencode');
        const encontrados = await filtrarExistentes([
          join(base, 'AGENTS.md'),
          join(base, 'opencode.json'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'opencode',
            clientName: 'OpenCode',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_PARTIAL,
            estimatedItemCount: encontrados.length,
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      const base = target.scope === 'global'
        ? join(homedir(), '.config', 'opencode')
        : resolverRaizProjetoPorPath(target.detectedPaths[0]);

      return lerArquivosEspecificos([
        { path: join(base, 'AGENTS.md'), slug: 'agents', type: 'instruction' },
        { path: join(base, 'opencode.json'), slug: 'opencode-config', type: 'mcp_config', title: 'OpenCode Config' },
      ]);
    },
    escrever: async (items, target) => escreverEstruturaOpenCode(items, target),
  };
}

function criarAdapterQwen(): ClienteAdapter {
  return {
    id: 'qwen',
    nome: 'Qwen Code',
    nivelSuporte: 'partial',
    escopoSuportado: 'project',
    tiposSuportados: ['instruction'],
    detectar: async (ctx, scope) => {
      if (scope === 'global') return [];

      const caminho = join(ctx.projectDir, '.qwen', 'AGENTS.md');
      if (!(await existe(caminho))) return [];

      return [{
        clientId: 'qwen',
        clientName: 'Qwen Code',
        supportLevel: 'partial',
        scope: 'project',
        detectedPaths: [caminho],
        supportedTypes: ['instruction'],
        estimatedItemCount: 1,
      }];
    },
    ler: async (target) => lerArquivosEspecificos([
      { path: target.detectedPaths[0], slug: 'agents', type: 'instruction' },
    ]),
    escrever: async (items, target) => escreverArquivoUnico(items, target, 'instruction', (entry) => join(resolverRaizProjetoPorPath(entry.detectedPaths[0]), '.qwen', 'AGENTS.md')),
  };
}

function criarAdapterAider(): ClienteAdapter {
  return {
    id: 'aider',
    nome: 'Aider',
    nivelSuporte: 'partial',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_PARTIAL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        const encontrados = await filtrarExistentes([
          join(ctx.projectDir, '.aider.conf.yml'),
          join(ctx.projectDir, 'CONVENTIONS.md'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'aider',
            clientName: 'Aider',
            supportLevel: 'partial',
            scope: 'project',
            detectedPaths: encontrados,
            supportedTypes: TIPOS_PARTIAL,
            estimatedItemCount: encontrados.length,
          });
        }
      }

      if (scope !== 'project') {
        const encontrados = await filtrarExistentes([
          join(ctx.userHome, '.aider.conf.yml'),
        ]);

        if (encontrados.length > 0) {
          targets.push({
            clientId: 'aider',
            clientName: 'Aider',
            supportLevel: 'partial',
            scope: 'global',
            detectedPaths: encontrados,
            supportedTypes: ['mcp_config'],
            estimatedItemCount: encontrados.length,
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      if (target.scope === 'global') {
        return lerArquivosEspecificos([
          { path: join(homedir(), '.aider.conf.yml'), slug: 'aider-config', type: 'mcp_config', title: 'Aider Config' },
        ]);
      }

      const base = resolverRaizProjetoPorPath(target.detectedPaths[0]);
      return lerArquivosEspecificos([
        { path: join(base, 'CONVENTIONS.md'), slug: 'conventions', type: 'instruction', title: 'Conventions' },
        { path: join(base, '.aider.conf.yml'), slug: 'aider-config', type: 'mcp_config', title: 'Aider Config' },
      ]);
    },
    escrever: async (items, target) => escreverEstruturaAider(items, target),
  };
}

function criarAdapterAntigravity(): ClienteAdapter {
  return {
    id: 'antigravity',
    nome: 'Antigravity',
    nivelSuporte: 'experimental',
    escopoSuportado: 'all',
    tiposSuportados: TIPOS_PARTIAL,
    detectar: async (ctx, scope) => {
      const targets: SyncTarget[] = [];

      if (scope !== 'global') {
        const caminhoProjeto = join(ctx.projectDir, '.antigravity');
        if (await existe(caminhoProjeto)) {
          targets.push({
            clientId: 'antigravity',
            clientName: 'Antigravity',
            supportLevel: 'experimental',
            scope: 'project',
            detectedPaths: [caminhoProjeto],
            supportedTypes: TIPOS_PARTIAL,
            estimatedItemCount: 1,
          });
        }
      }

      if (scope !== 'project') {
        const caminhoGlobal = join(ctx.userHome, '.gemini', 'antigravity-cli', 'settings.json');
        if (await existe(caminhoGlobal)) {
          targets.push({
            clientId: 'antigravity',
            clientName: 'Antigravity',
            supportLevel: 'experimental',
            scope: 'global',
            detectedPaths: [caminhoGlobal],
            supportedTypes: ['mcp_config'],
            estimatedItemCount: 1,
          });
        }
      }

      return targets;
    },
    ler: async (target) => {
      const tipo = target.scope === 'global' ? 'mcp_config' : 'instruction';
      const slug = target.scope === 'global' ? 'antigravity-settings' : 'antigravity';
      return lerArquivosEspecificos([{ path: target.detectedPaths[0], slug, type: tipo }]);
    },
    escrever: async (items, target) => escreverEstruturaAntigravity(items, target),
  };
}

async function lerEstruturaClaude(raizProjeto: string): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  const base = join(raizProjeto, '.claude');

  await lerMarkdownsDiretos(join(base, 'skills'), 'skill', itens);
  await lerMarkdownsDiretos(join(base, 'agents'), 'agent', itens);
  await lerMarkdownsDiretos(join(base, 'memory'), 'memory', itens);
  await lerMarkdownsDiretos(join(base, 'snippets'), 'snippet', itens);
  await lerMarkdownsDiretos(join(base, 'hooks'), 'hook', itens);
  await lerArquivoInstrucao(join(base, 'CLAUDE.md'), 'claude', itens);
  await lerArquivosRules(base, itens);
  await lerArquivoConfig(join(base, '.mcp.json'), 'mcp-config', 'MCP Config', itens);

  return [...itens.values()];
}

async function lerEstruturaCodex(base: string, global = false): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  const codexDir = global ? base : join(base, '.codex');

  await lerArquivoInstrucao(join(codexDir, 'AGENTS.md'), 'agents', itens);
  await lerArquivoConfig(global ? join(codexDir, 'config.toml') : join(codexDir, '.mcp.json'), global ? 'codex-config' : 'mcp-config', global ? 'Codex Config' : 'MCP Config', itens);
  await lerSkillsCodex(join(codexDir, 'skills'), itens);

  if (!global) {
    await lerArquivoInstrucao(join(base, 'AGENTS.md'), 'agents', itens);
    await lerArquivoConfig(join(base, '.mcp.json'), 'mcp-config', 'MCP Config', itens);
  }

  return [...itens.values()];
}

async function lerEstruturaCursor(base: string): Promise<ItemSincronizavel[]> {
  const itens = new Map<string, ItemSincronizavel>();
  await lerMarkdownsDiretos(base, 'instruction', itens, ['.mdc', '.md']);
  await lerArquivoConfig(join(dirname(base), 'mcp.json'), 'cursor-mcp', 'Cursor MCP', itens);
  return [...itens.values()];
}

async function lerMarkdownsDiretos(
  diretorio: string,
  tipo: TipoSincronizavel,
  itens: Map<string, ItemSincronizavel>,
  extensoesPermitidas = ['.md'],
): Promise<void> {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorio);
  } catch {
    return;
  }

  for (const arquivo of arquivos) {
    if (!extensoesPermitidas.includes(extname(arquivo))) continue;

    const conteudo = await readFile(join(diretorio, arquivo), 'utf-8');
    const { frontmatter, corpo } = parsearFrontmatter(conteudo);
    const slug = normalizarSlug(basename(arquivo, extname(arquivo)));
    const titulo = typeof frontmatter.name === 'string' && frontmatter.name
      ? frontmatter.name
      : tituloDoSlug(slug);

    itens.set(`${tipo}:${slug}`, {
      type: tipo,
      title: titulo,
      slug,
      body: corpo || conteudo,
      metadata: {},
      tags: [],
    });
  }
}

async function lerSkillsCodex(diretorioSkills: string, itens: Map<string, ItemSincronizavel>): Promise<void> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorioSkills);
  } catch {
    return;
  }

  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    const caminhoDireto = join(diretorioSkills, entrada, 'SKILL.md');

    if (await existe(caminhoDireto)) {
      await registrarSkillCodex(caminhoDireto, entrada, itens);
      continue;
    }

    const subentradas = await listarEntradas(join(diretorioSkills, entrada));
    for (const subentrada of subentradas) {
      if (DIRETORIOS_IGNORADOS.has(subentrada)) continue;
      await registrarSkillCodex(join(diretorioSkills, entrada, subentrada, 'SKILL.md'), subentrada, itens);
    }
  }
}

async function registrarSkillCodex(caminho: string, slug: string, itens: Map<string, ItemSincronizavel>) {
  if (!(await existe(caminho))) return;

  const conteudo = await readFile(caminho, 'utf-8');
  const { frontmatter, corpo } = parsearFrontmatter(conteudo);
  const titulo = typeof frontmatter.name === 'string' && frontmatter.name
    ? frontmatter.name
    : tituloDoSlug(slug);

  itens.set(`skill:${slug}`, {
    type: 'skill',
    title: titulo,
    slug: normalizarSlug(slug),
    body: corpo || conteudo,
    metadata: {},
    tags: [],
  });
}

async function lerArquivoInstrucao(caminhoArquivo: string, slug: string, itens: Map<string, ItemSincronizavel>) {
  if (!(await existe(caminhoArquivo))) return;

  const conteudo = await readFile(caminhoArquivo, 'utf-8');
  itens.set(`instruction:${slug}`, {
    type: 'instruction',
    title: tituloDoSlug(slug),
    slug,
    body: conteudo,
    metadata: {},
    tags: [],
  });
}

async function lerArquivoConfig(
  caminhoArquivo: string,
  slug: string,
  title: string,
  itens: Map<string, ItemSincronizavel>,
) {
  if (!(await existe(caminhoArquivo))) return;

  const conteudo = await readFile(caminhoArquivo, 'utf-8');
  itens.set(`mcp_config:${slug}`, {
    type: 'mcp_config',
    title,
    slug,
    body: conteudo,
    metadata: {},
    tags: [],
  });
}

async function lerArquivosRules(diretorio: string, itens: Map<string, ItemSincronizavel>) {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorio);
  } catch {
    return;
  }

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith('.rules.md')) continue;
    const conteudo = await readFile(join(diretorio, arquivo), 'utf-8');
    const slug = normalizarSlug(basename(arquivo, '.md'));
    itens.set(`instruction:${slug}`, {
      type: 'instruction',
      title: tituloDoSlug(slug),
      slug,
      body: conteudo,
      metadata: {},
      tags: [],
    });
  }
}

async function lerArquivosEspecificos(definicoes: Array<{ path: string; slug: string; type: TipoSincronizavel; title?: string }>) {
  const itens: ItemSincronizavel[] = [];

  for (const definicao of definicoes) {
    if (!(await existe(definicao.path))) continue;
    const conteudo = await readFile(definicao.path, 'utf-8');
    itens.push({
      type: definicao.type,
      title: definicao.title ?? tituloDoSlug(definicao.slug),
      slug: definicao.slug,
      body: conteudo,
      metadata: {},
      tags: [],
    });
  }

  return itens;
}

async function escreverEstruturaClaude(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const root = resolverRaizProjetoPorPath(target.detectedPaths[0]);
  const base = join(root, '.claude');

  return escreverComRegras(items, target, {
    skill: { dir: join(base, 'skills'), ext: '.md' },
    instruction: { file: join(base, 'CLAUDE.md') },
    mcp_config: { file: join(base, '.mcp.json') },
    agent: { dir: join(base, 'agents'), ext: '.md' },
    hook: { dir: join(base, 'hooks'), ext: '.md' },
    memory: { dir: join(base, 'memory'), ext: '.md' },
    snippet: { dir: join(base, 'snippets'), ext: '.md' },
  });
}

async function escreverEstruturaCodex(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? join(homedir(), '.codex')
    : join(resolverRaizProjetoPorPath(target.detectedPaths[0]), '.codex');

  return escreverComRegras(items, target, {
    skill: { dir: join(base, 'skills'), ext: '/SKILL.md' },
    instruction: { file: join(base, 'AGENTS.md') },
    mcp_config: { file: target.scope === 'global' ? join(base, 'config.toml') : join(base, '.mcp.json') },
  });
}

async function escreverEstruturaCursor(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = resolverBaseOculta(target, '.cursor');
  return escreverComRegras(items, target, {
    instruction: { dir: base, ext: '.mdc' },
    mcp_config: { file: join(dirname(base), 'mcp.json') },
  });
}

async function escreverEstruturaOpenCode(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? join(homedir(), '.config', 'opencode')
    : resolverRaizProjetoPorPath(target.detectedPaths[0]);
  return escreverComRegras(items, target, {
    instruction: { file: join(base, 'AGENTS.md') },
    mcp_config: { file: target.scope === 'global' ? join(base, 'opencode.json') : join(base, 'opencode.json') },
  });
}

async function escreverEstruturaAider(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? homedir()
    : resolverRaizProjetoPorPath(target.detectedPaths[0]);
  return escreverComRegras(items, target, {
    instruction: target.scope === 'global' ? undefined : { file: join(base, 'CONVENTIONS.md') },
    mcp_config: { file: target.scope === 'global' ? join(base, '.aider.conf.yml') : join(base, '.aider.conf.yml') },
  });
}

async function escreverEstruturaAntigravity(items: ItemSincronizavel[], target: SyncTarget): Promise<EscritaCliente> {
  const base = target.scope === 'global'
    ? join(homedir(), '.gemini', 'antigravity-cli')
    : resolverRaizProjetoPorPath(target.detectedPaths[0]);
  return escreverComRegras(items, target, {
    instruction: target.scope === 'global' ? undefined : { file: join(base, '.antigravity') },
    mcp_config: target.scope === 'global' ? { file: join(base, 'settings.json') } : { file: join(base, '.antigravity') },
  });
}

async function escreverArquivoUnico(
  items: ItemSincronizavel[],
  target: SyncTarget,
  type: TipoSincronizavel,
  resolver: (target: SyncTarget) => string,
): Promise<EscritaCliente> {
  const caminho = resolver(target);
  return escreverComRegras(items, target, {
    [type]: { file: caminho },
  } as Partial<Record<TipoSincronizavel, { file?: string; dir?: string; ext?: string }>>);
}

function obterCaminhoGemini(target: SyncTarget) {
  if (target.scope === 'global') {
    const base = process.env.GEMINI_CLI_HOME ? resolve(process.env.GEMINI_CLI_HOME) : join(homedir(), '.gemini');
    return join(base, 'GEMINI.md');
  }

  return join(resolverRaizProjetoPorPath(target.detectedPaths[0]), 'GEMINI.md');
}

async function escreverComRegras(
  items: ItemSincronizavel[],
  target: SyncTarget,
  regras: Partial<Record<TipoSincronizavel, { file?: string; dir?: string; ext?: string } | undefined>>,
): Promise<EscritaCliente> {
  const written: EscritaCliente['written'] = [];
  const ignored: EscritaCliente['ignored'] = [];

  for (const item of items) {
    const regra = regras[item.type];
    if (!regra) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'tipo sem suporte nativo neste cliente' });
      continue;
    }

    if (regra.file) {
      await mkdir(dirname(regra.file), { recursive: true });
      await writeFile(regra.file, item.body, 'utf-8');
      written.push({ path: regra.file, type: item.type, slug: item.slug });
      continue;
    }

    if (!regra.dir || !regra.ext) {
      ignored.push({ type: item.type, slug: item.slug, reason: 'regra de escrita incompleta' });
      continue;
    }

    const caminho = regra.ext.startsWith('/')
      ? join(regra.dir, item.slug, regra.ext.slice(1))
      : join(regra.dir, `${item.slug}${regra.ext}`);

    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, item.body, 'utf-8');
    written.push({ path: caminho, type: item.type, slug: item.slug });
  }

  return {
    clientId: target.clientId,
    clientName: target.clientName,
    scope: target.scope,
    written,
    ignored,
  };
}

function resolverBaseOculta(target: SyncTarget, dir: string) {
  if (target.scope === 'global') {
    return join(homedir(), dir, 'rules');
  }

  return join(resolverRaizProjetoPorPath(target.detectedPaths[0]), dir, 'rules');
}

function resolverRaizProjetoPorPath(path: string) {
  if (!path) return process.cwd();

  const normalizado = resolve(path);
  const marcadores = ['.claude', '.codex', '.cursor', '.qwen'];
  const marcador = marcadores.find((entry) => normalizado.includes(`${entry}\\`) || normalizado.includes(`${entry}/`));

  if (!marcador) {
    return dirname(normalizado);
  }

  const indiceMarcador = normalizado.indexOf(marcador);
  if (indiceMarcador <= 0) {
    return dirname(normalizado);
  }

  const prefixo = normalizado.slice(0, indiceMarcador);
  return prefixo.endsWith('\\') || prefixo.endsWith('/')
    ? prefixo.slice(0, -1)
    : prefixo;
}

async function filtrarExistentes(paths: string[]) {
  const encontrados: string[] = [];

  for (const path of paths) {
    if (await existe(path)) {
      encontrados.push(path);
    }
  }

  return encontrados;
}

async function contarArquivosMarkdown(dir: string) {
  return contarArquivosPorExtensao(dir, ['.md']);
}

async function contarArquivosPorExtensao(dir: string, extensoes: string[]) {
  let arquivos: string[];
  try {
    arquivos = await readdir(dir);
  } catch {
    return 0;
  }

  return arquivos.filter((arquivo) => extensoes.includes(extname(arquivo))).length;
}

async function contarSkillsCodex(dir: string) {
  let entradas: string[];
  try {
    entradas = await readdir(dir);
  } catch {
    return 0;
  }

  let total = 0;
  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    if (await existe(join(dir, entrada, 'SKILL.md'))) {
      total += 1;
      continue;
    }

    const subentradas = await listarEntradas(join(dir, entrada));
    total += subentradas.filter((subentrada) => !DIRETORIOS_IGNORADOS.has(subentrada)).length;
  }

  return total;
}

async function listarEntradas(diretorio: string): Promise<string[]> {
  try {
    return await readdir(diretorio);
  } catch {
    return [];
  }
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await access(caminho, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parsearFrontmatter(conteudo: string): { frontmatter: Record<string, unknown>; corpo: string } {
  if (!conteudo.startsWith('---')) {
    return { frontmatter: {}, corpo: conteudo };
  }

  const fimMarcador = conteudo.indexOf('---', 3);
  if (fimMarcador === -1) {
    return { frontmatter: {}, corpo: conteudo };
  }

  const blocoYaml = conteudo.slice(3, fimMarcador).trim();
  const corpo = conteudo.slice(fimMarcador + 3).trim();
  const frontmatter: Record<string, unknown> = {};

  for (const linha of blocoYaml.split('\n')) {
    const separador = linha.indexOf(':');
    if (separador === -1) continue;

    frontmatter[linha.slice(0, separador).trim()] = linha.slice(separador + 1).trim();
  }

  return { frontmatter, corpo };
}

function tituloDoSlug(slug: string): string {
  return slug
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

function normalizarSlug(valor: string) {
  return valor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
