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

const MAPEAMENTO_TIPO: Record<string, string> = {
  skills: 'skill',
  agents: 'agent',
  memory: 'memory',
  snippets: 'snippet',
};

function slugDoArquivo(nomeArquivo: string): string {
  return basename(nomeArquivo, extname(nomeArquivo));
}

function tituloDoSlug(slug: string): string {
  return slug
    .split('-')
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

async function lerDiretorio(caminho: string, tipo: string): Promise<ItemParaPush[]> {
  const itens: ItemParaPush[] = [];

  let arquivos: string[];
  try {
    arquivos = await readdir(caminho);
  } catch {
    return [];
  }

  const markdowns = arquivos.filter((f) => f.endsWith('.md'));

  for (const arquivo of markdowns) {
    const conteudo = await readFile(join(caminho, arquivo), 'utf-8');
    const slug = slugDoArquivo(arquivo);

    itens.push({
      type: tipo,
      title: tituloDoSlug(slug),
      slug,
      body: conteudo,
      metadata: {},
      tags: [],
    });
  }

  return itens;
}

export async function lerConteudoLocal(diretorioBase: string): Promise<ItemParaPush[]> {
  const claudeDir = join(diretorioBase, '.claude');
  const itens: ItemParaPush[] = [];

  for (const [pasta, tipo] of Object.entries(MAPEAMENTO_TIPO)) {
    const caminho = join(claudeDir, pasta);
    const lidos = await lerDiretorio(caminho, tipo);
    itens.push(...lidos);
  }

  const claudeMdPath = join(claudeDir, 'CLAUDE.md');
  try {
    const conteudo = await readFile(claudeMdPath, 'utf-8');
    itens.push({
      type: 'instruction',
      title: 'CLAUDE',
      slug: 'claude',
      body: conteudo,
      metadata: {},
      tags: [],
    });
  } catch {
    // CLAUDE.md não existe, segue sem ele
  }

  return itens;
}
