import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

export interface ItemImportado {
  type: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface Frontmatter {
  name?: string;
  description?: string;
  type?: string;
  [key: string]: unknown;
}

export async function importarDiretorio(diretorioBase: string): Promise<ItemImportado[]> {
  const itens = new Map<string, ItemImportado>();
  const raiz = resolve(diretorioBase);

  await escanearRaizConhecida(raiz, itens);

  return [...itens.values()];
}

export function detectarNomeRepositorio(diretorio: string): string {
  const dirResolvido = resolve(diretorio);

  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: dirResolvido,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const nome = basename(remoteUrl, '.git');
    return normalizarSlug(nome);
  } catch {
    // Sem git ou sem remote — usa nome da pasta
  }

  const pastaPai = basename(dirResolvido);
  if (pastaPai === '.claude' || pastaPai === '.codex') {
    return normalizarSlug(basename(resolve(dirResolvido, '..')));
  }

  return normalizarSlug(pastaPai);
}

async function escanearRaizConhecida(diretorio: string, itens: Map<string, ItemImportado>): Promise<void> {
  await importarArquivosDeRaiz(diretorio, itens);

  const nomeDiretorio = basename(diretorio);
  if (nomeDiretorio === '.claude') {
    await importarEstruturaClaude(diretorio, itens);
    return;
  }

  if (nomeDiretorio === '.codex') {
    await importarEstruturaCodex(diretorio, itens);
    return;
  }

  const diretorioClaude = join(diretorio, '.claude');
  if (await existe(diretorioClaude)) {
    await importarArquivosDeRaiz(diretorio, itens);
    await importarEstruturaClaude(diretorioClaude, itens);
  }

  const diretorioCodex = join(diretorio, '.codex');
  if (await existe(diretorioCodex)) {
    await importarEstruturaCodex(diretorioCodex, itens);
  }

  const entradas = await listarSubdiretorios(diretorio);
  for (const entrada of entradas) {
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
    if (entrada === '.claude' || entrada === '.codex') continue;

    await escanearRaizConhecida(join(diretorio, entrada), itens);
  }
}

async function importarEstruturaClaude(diretorioClaude: string, itens: Map<string, ItemImportado>): Promise<void> {
  await importarMarkdownsDiretos(join(diretorioClaude, 'skills'), 'skill', itens);
  await importarMarkdownsDiretos(join(diretorioClaude, 'agents'), 'agent', itens);
  await importarMarkdownsDiretos(join(diretorioClaude, 'memory'), 'memory', itens);
  await importarMarkdownsDiretos(join(diretorioClaude, 'snippets'), 'snippet', itens);
  await importarMarkdownsDiretos(join(diretorioClaude, 'hooks'), 'hook', itens);

  await importarArquivoInstrucao(join(diretorioClaude, 'CLAUDE.md'), 'claude', itens);
  await importarArquivosRules(diretorioClaude, itens);
  await importarArquivoMcp(join(diretorioClaude, '.mcp.json'), itens);
}

async function importarEstruturaCodex(diretorioCodex: string, itens: Map<string, ItemImportado>): Promise<void> {
  await importarArquivoInstrucao(join(diretorioCodex, 'AGENTS.md'), 'agents', itens);
  await importarArquivoInstrucao(join(diretorioCodex, 'CLAUDE.md'), 'claude', itens);
  await importarArquivoMcp(join(diretorioCodex, '.mcp.json'), itens);
  await importarSkillsCodex(join(diretorioCodex, 'skills'), itens);
}

async function importarArquivosDeRaiz(diretorio: string, itens: Map<string, ItemImportado>): Promise<void> {
  await importarArquivoInstrucao(join(diretorio, 'AGENTS.md'), 'agents', itens);
  await importarArquivoInstrucao(join(diretorio, 'CLAUDE.md'), 'claude', itens);
  await importarArquivoMcp(join(diretorio, '.mcp.json'), itens);
}

async function importarMarkdownsDiretos(
  diretorio: string,
  tipo: string,
  itens: Map<string, ItemImportado>,
): Promise<void> {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorio);
  } catch {
    return;
  }

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith('.md')) continue;

    const caminho = join(diretorio, arquivo);
    const conteudoBruto = await readFile(caminho, 'utf-8');
    const { frontmatter, corpo } = parsearFrontmatter(conteudoBruto);
    const slug = normalizarSlug(basename(arquivo, extname(arquivo)));
    const titulo = typeof frontmatter.name === 'string' && frontmatter.name
      ? frontmatter.name
      : tituloDoSlug(slug);

    registrarItem(itens, {
      type: typeof frontmatter.type === 'string' && frontmatter.type ? frontmatter.type : tipo,
      title: titulo,
      slug,
      body: corpo || conteudoBruto,
      metadata: extrairMetadata(frontmatter),
      tags: [],
    });
  }
}

async function importarSkillsCodex(diretorioSkills: string, itens: Map<string, ItemImportado>): Promise<void> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorioSkills);
  } catch {
    return;
  }

  for (const entrada of entradas) {
    const caminhoEntrada = join(diretorioSkills, entrada);
    if (DIRETORIOS_IGNORADOS.has(entrada)) continue;

    if (await existe(join(caminhoEntrada, 'SKILL.md'))) {
      const conteudoBruto = await readFile(join(caminhoEntrada, 'SKILL.md'), 'utf-8');
      const { frontmatter, corpo } = parsearFrontmatter(conteudoBruto);
      const slug = normalizarSlug(entrada);
      const titulo = typeof frontmatter.name === 'string' && frontmatter.name
        ? frontmatter.name
        : tituloDoSlug(slug);

      registrarItem(itens, {
        type: 'skill',
        title: titulo,
        slug,
        body: corpo || conteudoBruto,
        metadata: extrairMetadata(frontmatter),
        tags: [],
      });
      continue;
    }

    const subdiretorios = await listarSubdiretorios(caminhoEntrada);
    for (const subdiretorio of subdiretorios) {
      if (DIRETORIOS_IGNORADOS.has(subdiretorio)) continue;
      const caminhoSubdiretorio = join(caminhoEntrada, subdiretorio);
      if (!(await existe(join(caminhoSubdiretorio, 'SKILL.md')))) continue;

      const conteudoBruto = await readFile(join(caminhoSubdiretorio, 'SKILL.md'), 'utf-8');
      const { frontmatter, corpo } = parsearFrontmatter(conteudoBruto);
      const slug = normalizarSlug(subdiretorio);
      const titulo = typeof frontmatter.name === 'string' && frontmatter.name
        ? frontmatter.name
        : tituloDoSlug(slug);

      registrarItem(itens, {
        type: 'skill',
        title: titulo,
        slug,
        body: corpo || conteudoBruto,
        metadata: extrairMetadata(frontmatter),
        tags: [],
      });
    }
  }
}

async function importarArquivoInstrucao(
  caminhoArquivo: string,
  slug: string,
  itens: Map<string, ItemImportado>,
): Promise<void> {
  if (!(await existe(caminhoArquivo))) return;

  const conteudo = await readFile(caminhoArquivo, 'utf-8');
  registrarItem(itens, {
    type: 'instruction',
    title: tituloDoSlug(slug),
    slug,
    body: conteudo,
    metadata: {},
    tags: [],
  });
}

async function importarArquivosRules(diretorio: string, itens: Map<string, ItemImportado>): Promise<void> {
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
    registrarItem(itens, {
      type: 'instruction',
      title: tituloDoSlug(slug),
      slug,
      body: conteudo,
      metadata: {},
      tags: [],
    });
  }
}

async function importarArquivoMcp(caminhoArquivo: string, itens: Map<string, ItemImportado>): Promise<void> {
  if (!(await existe(caminhoArquivo))) return;

  const conteudo = await readFile(caminhoArquivo, 'utf-8');
  registrarItem(itens, {
    type: 'mcp_config',
    title: 'MCP Config',
    slug: 'mcp-config',
    body: conteudo,
    metadata: {},
    tags: [],
  });
}

function parsearFrontmatter(conteudo: string): { frontmatter: Frontmatter; corpo: string } {
  if (!conteudo.startsWith('---')) {
    return { frontmatter: {}, corpo: conteudo };
  }

  const fimMarcador = conteudo.indexOf('---', 3);
  if (fimMarcador === -1) {
    return { frontmatter: {}, corpo: conteudo };
  }

  const blocoYaml = conteudo.slice(3, fimMarcador).trim();
  const corpo = conteudo.slice(fimMarcador + 3).trim();

  const frontmatter: Frontmatter = {};
  for (const linha of blocoYaml.split('\n')) {
    const separador = linha.indexOf(':');
    if (separador === -1) continue;

    const chave = linha.slice(0, separador).trim();
    const valor = linha.slice(separador + 1).trim();
    frontmatter[chave] = valor;
  }

  return { frontmatter, corpo };
}

function extrairMetadata(frontmatter: Frontmatter): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (frontmatter.description) {
    metadata.description = frontmatter.description;
  }

  return metadata;
}

function registrarItem(itens: Map<string, ItemImportado>, item: ItemImportado): void {
  itens.set(`${item.type}:${item.slug}`, item);
}

function tituloDoSlug(slug: string): string {
  return slug
    .split('-')
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

function normalizarSlug(valor: string): string {
  return valor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function listarSubdiretorios(diretorio: string): Promise<string[]> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorio);
  } catch {
    return [];
  }

  return entradas;
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await readdir(caminho);
    return true;
  } catch {
    try {
      await readFile(caminho, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }
}

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
