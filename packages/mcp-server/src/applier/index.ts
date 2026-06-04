import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises';
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

const MARCADOR_GUIA_MYINST = '<!-- myinst-managed: true -->';

const CONTEUDO_GUIA_MYINST = `${MARCADOR_GUIA_MYINST}
# MyInst MCP

Use o MyInst como fluxo local-first para skills e instrucoes.

## Fluxo padrao
- No inicio do trabalho, use myinst_pull para materializar o vault no projeto local.
- Prefira os arquivos locais em .claude/ em vez de repetir consultas ao MCP.
- Use myinst_search apenas para descoberta pontual quando o conteudo ainda nao estiver local.
- Sempre que criar, editar, reescrever ou reorganizar skills, instructions, agents, hooks, memory ou snippets em .claude/, use myinst_push para sincronizar com o vault do usuario.
- Quando estiver fora do contexto default, informe workspace e project explicitamente nas tools.

## Arquivos materializados
- Skills: .claude/skills/{slug}.md
- Instructions: .claude/CLAUDE.md
- Agents: .claude/agents/{slug}.md
- Hooks: .claude/hook-{slug}.md
- Memory: .claude/memory/{slug}.md
- Snippets: .claude/snippets/{slug}.md

## Regra operacional
O ciclo correto e: myinst_pull -> trabalho local -> myinst_push.
`;

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

  aplicados.push(await aplicarGuiaMyInst(targetDir, conflictStrategy));

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

async function aplicarGuiaMyInst(
  targetDir: string,
  conflictStrategy: ConflictStrategy,
): Promise<ItemAplicado> {
  const dir = join(targetDir, '.claude');
  const caminhoGuia = join(dir, 'MYINST.md');

  await mkdir(dir, { recursive: true });

  const existe = await arquivoExiste(caminhoGuia);
  if (!existe) {
    await writeFile(caminhoGuia, CONTEUDO_GUIA_MYINST, 'utf-8');
    return criarResultadoGuia(caminhoGuia, 'created');
  }

  const conteudoAtual = await readFile(caminhoGuia, 'utf-8');
  const ehGerenciadoPeloMyInst = conteudoAtual.includes(MARCADOR_GUIA_MYINST);

  if (ehGerenciadoPeloMyInst) {
    await writeFile(caminhoGuia, CONTEUDO_GUIA_MYINST, 'utf-8');
    return criarResultadoGuia(caminhoGuia, 'overwritten');
  }

  if (conflictStrategy === 'skip') {
    return criarResultadoGuia(caminhoGuia, 'skipped');
  }

  const caminhoPrefixado = join(dir, 'vault-MYINST.md');
  await writeFile(caminhoPrefixado, CONTEUDO_GUIA_MYINST, 'utf-8');
  return criarResultadoGuia(caminhoPrefixado, 'prefixed');
}

function criarResultadoGuia(path: string, status: ItemAplicado['status']): ItemAplicado {
  return {
    type: 'instruction',
    title: 'MyInst MCP',
    slug: 'myinst',
    path,
    status,
  };
}
