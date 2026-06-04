import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { carregarConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

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
  instruction: () => 'CLAUDE.md',
  mcp_config: () => '.mcp.json',
  agent: (slug) => `${slug}.md`,
  hook: (slug) => `hook-${slug}.md`,
  memory: (slug) => `${slug}.md`,
  snippet: (slug) => `${slug}.md`,
};

async function aplicarConteudo(items: ConteudoItem[], targetDir: string): Promise<string[]> {
  const aplicados: string[] = [];

  for (const item of items) {
    const dir = join(targetDir, MAPEAMENTO_DIRETORIO[item.type] || '.claude');
    const nomeArquivo = MAPEAMENTO_ARQUIVO[item.type]?.(item.slug) || `${item.slug}.md`;
    const caminhoCompleto = join(dir, nomeArquivo);

    await mkdir(dir, { recursive: true });

    let conteudo = item.body;
    if (item.type === 'instruction') {
      conteudo = `# ${item.title}\n\n${item.body}`;
    }

    await writeFile(caminhoCompleto, conteudo, 'utf-8');
    aplicados.push(`  ${CINZA}${item.type}${RESET} ${item.title} -> ${caminhoCompleto}`);
  }

  return aplicados;
}

export async function executarPull(projeto: string, workspace?: string): Promise<void> {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  console.log(`${CINZA}Baixando conteudo do projeto "${projeto}"...${RESET}`);

  try {
    const resposta = await fetch(`${config.server}/api/v1/sync/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ workspace, project: projeto }),
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({ error: { message: resposta.statusText } }));
      console.error(`${VERMELHO}[ERROR] ${erro.error?.message || resposta.statusText}${RESET}`);
      process.exit(1);
    }

    const json = await resposta.json();
    const dados = json.data ?? json;
    const items: ConteudoItem[] = dados.items;

    if (items.length === 0) {
      console.log(`${AMARELO}[WARN] Nenhum conteudo encontrado no projeto "${projeto}"${RESET}`);
      return;
    }

    const diretorioAtual = process.cwd();
    const aplicados = await aplicarConteudo(items, diretorioAtual);

    console.log(`${VERDE}[SUCCESS] ${items.length} item(ns) aplicado(s):${RESET}`);
    aplicados.forEach((linha) => console.log(linha));
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('fetch')) {
      console.error(`${VERMELHO}[ERROR] Nao foi possivel conectar ao servidor${RESET}`);
    } else {
      throw erro;
    }
    process.exit(1);
  }
}
