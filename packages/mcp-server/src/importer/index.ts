import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname, relative, resolve } from 'node:path';
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

function detectarTipo(caminhoRelativo: string): string | null {
  const normalizado = caminhoRelativo.replace(/\\/g, '/');

  if (/\/skills\//.test(normalizado) || normalizado.startsWith('skills/')) return 'skill';
  if (/\/agents\//.test(normalizado) || normalizado.startsWith('agents/')) return 'agent';
  if (/\/memory\//.test(normalizado) || normalizado.startsWith('memory/')) return 'memory';
  if (/\/snippets\//.test(normalizado) || normalizado.startsWith('snippets/')) return 'snippet';
  if (/\/hooks\//.test(normalizado) || normalizado.startsWith('hooks/')) return 'hook';
  if (/CLAUDE\.md$/.test(normalizado) || /\.rules\.md$/.test(normalizado)) return 'instruction';

  return null;
}

function slugDoArquivo(nomeArquivo: string): string {
  return basename(nomeArquivo, extname(nomeArquivo))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tituloDoSlug(slug: string): string {
  return slug
    .split('-')
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

async function listarArquivosRecursivo(diretorio: string): Promise<string[]> {
  const arquivos: string[] = [];

  let entradas: string[];
  try {
    entradas = await readdir(diretorio, { recursive: true }) as unknown as string[];
  } catch {
    return [];
  }

  for (const entrada of entradas) {
    const caminhoAbsoluto = join(diretorio, entrada);
    if (deveIgnorarCaminho(caminhoAbsoluto)) continue;

    arquivos.push(caminhoAbsoluto);
  }

  return arquivos;
}

export async function importarDiretorio(diretorioBase: string): Promise<ItemImportado[]> {
  const itens: ItemImportado[] = [];
  const todosArquivos = await listarArquivosRecursivo(diretorioBase);

  for (const caminhoAbsoluto of todosArquivos) {
    const caminhoRelativo = relative(diretorioBase, caminhoAbsoluto).replace(/\\/g, '/');
    const nomeArquivo = basename(caminhoAbsoluto);
    const extensao = extname(nomeArquivo);

    if (nomeArquivo === '.mcp.json') {
      try {
        const conteudo = await readFile(caminhoAbsoluto, 'utf-8');
        itens.push({
          type: 'mcp_config',
          title: 'MCP Config',
          slug: 'mcp-config',
          body: conteudo,
          metadata: {},
          tags: [],
        });
      } catch {
        // arquivo ilegível, ignora
      }
      continue;
    }

    if (extensao !== '.md') continue;

    const tipoDetectado = detectarTipo(caminhoRelativo);
    if (!tipoDetectado) continue;

    try {
      const conteudoBruto = await readFile(caminhoAbsoluto, 'utf-8');
      const { frontmatter, corpo } = parsearFrontmatter(conteudoBruto);

      const tipo = (frontmatter.type as string) || tipoDetectado;
      const slug = slugDoArquivo(nomeArquivo);
      const titulo = (frontmatter.name as string) || tituloDoSlug(slug);

      const metadata: Record<string, unknown> = {};
      if (frontmatter.description) {
        metadata.description = frontmatter.description;
      }

      itens.push({
        type: tipo,
        title: titulo,
        slug,
        body: corpo || conteudoBruto,
        metadata,
        tags: [],
      });
    } catch {
      // arquivo ilegível, ignora
    }
  }

  return itens;
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
    return nome.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  } catch {
    // Sem git ou sem remote — usa nome da pasta
  }

  const pastaPai = basename(dirResolvido);
  if (pastaPai === '.claude') {
    return basename(resolve(dirResolvido, '..')).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  return pastaPai.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function deveIgnorarCaminho(caminhoAbsoluto: string): boolean {
  const caminhoNormalizado = caminhoAbsoluto.replace(/\\/g, '/');
  const segmentos = caminhoNormalizado.split('/');

  return segmentos.some((segmento) => DIRETORIOS_IGNORADOS.has(segmento));
}

const DIRETORIOS_IGNORADOS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
]);
