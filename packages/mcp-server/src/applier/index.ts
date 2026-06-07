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

Use o MyInst como fluxo local-first para materializar, editar e sincronizar contexto agentic.

## Modelo de escopo
- project: conteudo do repositorio atual. Vai para workspace/projeto no vault.
- global: configuracoes e skills de cliente que valem para toda a conta. Vao para Client Profiles, fora de workspace e projeto.
- all: combina project e global na mesma operacao, mas o MyInst separa o destino correto de cada item.

## Fluxo oficial
- No inicio do trabalho, use myinst_pull para materializar o conteudo relevante localmente.
- Prefira os arquivos locais materializados em vez de repetir consultas ao MCP.
- Use myinst_search apenas para descoberta pontual ou para localizar conteudo remoto antes de materializar.
- Sempre que criar, editar, reescrever ou reorganizar skills, instructions, agents, hooks, memory, snippets ou mcp_config, finalize com myinst_push para sincronizar de volta.

## Regras de uso
- Se estiver trabalhando no repositorio atual, use scope=project.
- Se estiver trabalhando em configuracoes da home do usuario, como .codex, .gemini ou .config/opencode, use scope=global.
- Se houver mais de um cliente detectado, informe clients explicitamente.
- Quando nao estiver no contexto default, informe workspace e project explicitamente nas tools de projeto.
- Nao trate configuracoes globais de cliente como projeto. O destino correto e Client Profiles.

## Exemplos operacionais
- Projeto atual: myinst_pull com scope=project, editar arquivos locais, depois myinst_push com scope=project.
- Global do Codex: myinst_pull com scope=global e clients=["codex"], editar o conteudo materializado, depois myinst_push com scope=global e clients=["codex"].
- Busca global: myinst_search com scope=global e clientId="codex".
- Busca de projeto: myinst_search com workspace e project quando o contexto nao for o default.

## Arquivos materializados
- Skills: .claude/skills/{slug}.md
- Instructions: .claude/CLAUDE.md
- Agents: .claude/agents/{slug}.md
- Hooks: .claude/hook-{slug}.md
- Memory: .claude/memory/{slug}.md
- Snippets: .claude/snippets/{slug}.md
- MCP Config: .mcp.json

## Regra final
O ciclo correto e sempre:
myinst_pull -> trabalho local -> myinst_push
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
