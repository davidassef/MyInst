import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

interface ItemParaPush {
  type: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface Frontmatter {
  name?: string;
  [key: string]: unknown;
}

const MAPEAMENTO_TIPO: Record<string, string> = {
  skills: 'skill',
  agents: 'agent',
  memory: 'memory',
  snippets: 'snippet',
  hooks: 'hook',
};

export async function lerConteudoLocal(diretorioBase: string): Promise<ItemParaPush[]> {
  const itens = new Map<string, ItemParaPush>();

  await lerEstruturaClaude(diretorioBase, itens);
  await lerEstruturaCodex(diretorioBase, itens);
  await lerArquivosDaRaiz(diretorioBase, itens);

  return [...itens.values()];
}

async function lerEstruturaClaude(diretorioBase: string, itens: Map<string, ItemParaPush>): Promise<void> {
  const claudeDir = join(diretorioBase, '.claude');

  for (const [pasta, tipo] of Object.entries(MAPEAMENTO_TIPO)) {
    await lerMarkdownsDiretos(join(claudeDir, pasta), tipo, itens);
  }

  await lerArquivoInstrucao(join(claudeDir, 'CLAUDE.md'), 'claude', itens);
  await lerArquivosRules(claudeDir, itens);
  await lerArquivoMcp(join(claudeDir, '.mcp.json'), itens);
}

async function lerEstruturaCodex(diretorioBase: string, itens: Map<string, ItemParaPush>): Promise<void> {
  const codexDir = join(diretorioBase, '.codex');

  await lerArquivoInstrucao(join(codexDir, 'AGENTS.md'), 'agents', itens);
  await lerArquivoInstrucao(join(codexDir, 'CLAUDE.md'), 'claude', itens);
  await lerArquivoMcp(join(codexDir, '.mcp.json'), itens);
  await lerSkillsCodex(join(codexDir, 'skills'), itens);
}

async function lerArquivosDaRaiz(diretorioBase: string, itens: Map<string, ItemParaPush>): Promise<void> {
  await lerArquivoInstrucao(join(diretorioBase, 'AGENTS.md'), 'agents', itens);
  await lerArquivoInstrucao(join(diretorioBase, 'CLAUDE.md'), 'claude', itens);
  await lerArquivoMcp(join(diretorioBase, '.mcp.json'), itens);
}

async function lerMarkdownsDiretos(
  diretorio: string,
  tipo: string,
  itens: Map<string, ItemParaPush>,
): Promise<void> {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorio);
  } catch {
    return;
  }

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith('.md')) continue;

    const conteudo = await readFile(join(diretorio, arquivo), 'utf-8');
    const { frontmatter, corpo } = parsearFrontmatter(conteudo);
    const slug = basename(arquivo, extname(arquivo));
    const titulo = typeof frontmatter.name === 'string' && frontmatter.name
      ? frontmatter.name
      : tituloDoSlug(slug);

    registrarItem(itens, {
      type: tipo,
      title: titulo,
      slug,
      body: corpo || conteudo,
      metadata: {},
      tags: [],
    });
  }
}

async function lerSkillsCodex(diretorioSkills: string, itens: Map<string, ItemParaPush>): Promise<void> {
  let entradas: string[];
  try {
    entradas = await readdir(diretorioSkills);
  } catch {
    return;
  }

  for (const entrada of entradas) {
    const caminhoSkill = join(diretorioSkills, entrada, 'SKILL.md');
    if (await registrarSkillCodex(caminhoSkill, entrada, itens)) continue;

    const subentradas = await listarEntradas(join(diretorioSkills, entrada));
    for (const subentrada of subentradas) {
      const caminhoSubskill = join(diretorioSkills, entrada, subentrada, 'SKILL.md');
      await registrarSkillCodex(caminhoSubskill, subentrada, itens);
    }
  }
}

async function lerArquivoInstrucao(
  caminhoArquivo: string,
  slug: string,
  itens: Map<string, ItemParaPush>,
): Promise<void> {
  try {
    const conteudo = await readFile(caminhoArquivo, 'utf-8');
    registrarItem(itens, {
      type: 'instruction',
      title: tituloDoSlug(slug),
      slug,
      body: conteudo,
      metadata: {},
      tags: [],
    });
  } catch {
    // segue sem o arquivo
  }
}

async function lerArquivosRules(diretorio: string, itens: Map<string, ItemParaPush>): Promise<void> {
  let arquivos: string[];
  try {
    arquivos = await readdir(diretorio);
  } catch {
    return;
  }

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith('.rules.md')) continue;

    const conteudo = await readFile(join(diretorio, arquivo), 'utf-8');
    const slug = basename(arquivo, '.md');
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

async function lerArquivoMcp(caminhoArquivo: string, itens: Map<string, ItemParaPush>): Promise<void> {
  try {
    const conteudo = await readFile(caminhoArquivo, 'utf-8');
    registrarItem(itens, {
      type: 'mcp_config',
      title: 'MCP Config',
      slug: 'mcp-config',
      body: conteudo,
      metadata: {},
      tags: [],
    });
  } catch {
    // segue sem o arquivo
  }
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

function registrarItem(itens: Map<string, ItemParaPush>, item: ItemParaPush): void {
  itens.set(`${item.type}:${item.slug}`, item);
}

function tituloDoSlug(slug: string): string {
  return slug
    .split('-')
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

async function registrarSkillCodex(
  caminhoSkill: string,
  slug: string,
  itens: Map<string, ItemParaPush>,
): Promise<boolean> {
  try {
    const conteudo = await readFile(caminhoSkill, 'utf-8');
    const { frontmatter, corpo } = parsearFrontmatter(conteudo);
    const titulo = typeof frontmatter.name === 'string' && frontmatter.name
      ? frontmatter.name
      : tituloDoSlug(slug);

    registrarItem(itens, {
      type: 'skill',
      title: titulo,
      slug,
      body: corpo || conteudo,
      metadata: {},
      tags: [],
    });

    return true;
  } catch {
    return false;
  }
}

async function listarEntradas(diretorio: string): Promise<string[]> {
  try {
    return await readdir(diretorio);
  } catch {
    return [];
  }
}
