import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { carregarConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const RESET = '\x1b[0m';

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

async function lerConteudoLocal(diretorioBase: string): Promise<ItemParaPush[]> {
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
    // CLAUDE.md nao existe
  }

  return itens;
}

export async function executarPush(projeto: string): Promise<void> {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  const diretorioAtual = process.cwd();
  const itens = await lerConteudoLocal(diretorioAtual);

  if (itens.length === 0) {
    console.log(`${AMARELO}[WARN] Nenhum conteudo encontrado em .claude/${RESET}`);
    return;
  }

  console.log(`${CINZA}Enviando ${itens.length} item(ns) para o projeto "${projeto}"...${RESET}`);

  try {
    const resposta = await fetch(`${config.server}/api/v1/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ project: projeto, items: itens }),
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({ error: { message: resposta.statusText } }));
      console.error(`${VERMELHO}[ERROR] ${erro.error?.message || resposta.statusText}${RESET}`);
      process.exit(1);
    }

    const json = await resposta.json();
    const dados = json.data ?? json;

    console.log(`${VERDE}[SUCCESS] Push concluido:${RESET}`);
    if (dados.created?.length) {
      console.log(`  ${VERDE}Criados:${RESET} ${dados.created.join(', ')}`);
    }
    if (dados.updated?.length) {
      console.log(`  ${AMARELO}Atualizados:${RESET} ${dados.updated.join(', ')}`);
    }
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('fetch')) {
      console.error(`${VERMELHO}[ERROR] Nao foi possivel conectar ao servidor${RESET}`);
    } else {
      throw erro;
    }
    process.exit(1);
  }
}
