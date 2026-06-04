import { access, constants, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface ConteudoItem {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

export type ConflictStrategy = 'overwrite' | 'prefix' | 'skip';

interface ItemAplicado {
  type: string;
  title: string;
  slug: string;
  path: string;
  status: 'created' | 'overwritten' | 'prefixed' | 'skipped';
}

const MAPEAMENTO_DIRETORIO: Record<string, string> = {
  skill: '.claude/skills',
  instruction: '.claude',
  mcp_config: '.',
  agent: '.claude/agents',
  hook: '.claude',
  memory: '.claude/memory',
  snippet: '.claude/snippets',
};

const MAPEAMENTO_ARQUIVO: Record<string, (slug: string) => string> = {
  skill: (slug) => `${slug}.md`,
  instruction: (_slug) => 'CLAUDE.md',
  mcp_config: (_slug) => '.mcp.json',
  agent: (slug) => `${slug}.md`,
  hook: (slug) => `hook-${slug}.md`,
  memory: (slug) => `${slug}.md`,
  snippet: (slug) => `${slug}.md`,
};

async function arquivoExiste(caminho: string): Promise<boolean> {
  try {
    await access(caminho, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function aplicarConteudo(
  items: ConteudoItem[],
  targetDir: string,
  conflictStrategy: ConflictStrategy = 'overwrite',
): Promise<ItemAplicado[]> {
  const aplicados: ItemAplicado[] = [];

  for (const item of items) {
    const dir = join(targetDir, MAPEAMENTO_DIRETORIO[item.type] || '.claude');
    const nomeArquivo = MAPEAMENTO_ARQUIVO[item.type]?.(item.slug) || `${item.slug}.md`;
    const caminhoCompleto = join(dir, nomeArquivo);

    await mkdir(dir, { recursive: true });

    const existe = await arquivoExiste(caminhoCompleto);

    if (existe && conflictStrategy === 'skip') {
      aplicados.push({ type: item.type, title: item.title, slug: item.slug, path: caminhoCompleto, status: 'skipped' });
      continue;
    }

    let caminhoFinal = caminhoCompleto;
    let status: ItemAplicado['status'] = existe ? 'overwritten' : 'created';

    if (existe && conflictStrategy === 'prefix') {
      const nomePrefixado = `vault-${nomeArquivo}`;
      caminhoFinal = join(dir, nomePrefixado);
      status = 'prefixed';
    }

    let conteudo = item.body;

    if (item.type === 'instruction') {
      conteudo = `# ${item.title}\n\n${item.body}`;
    }

    await writeFile(caminhoFinal, conteudo, 'utf-8');

    aplicados.push({ type: item.type, title: item.title, slug: item.slug, path: caminhoFinal, status });
  }

  return aplicados;
}
