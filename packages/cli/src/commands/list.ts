import { carregarConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const AMARELO = '\x1b[33m';
const NEGRITO = '\x1b[1m';
const RESET = '\x1b[0m';

interface ConteudoItem {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  version: number;
  tags: string[];
}

export async function executarList(projeto: string): Promise<void> {
  const config = carregarConfig();

  if (!config) {
    console.error(`${VERMELHO}[ERROR] Nao autenticado. Execute: myinst login${RESET}`);
    process.exit(1);
  }

  console.log(`${CINZA}Listando conteudo do projeto "${projeto}"...${RESET}\n`);

  try {
    const resposta = await fetch(`${config.server}/api/v1/projects/${encodeURIComponent(projeto)}/content`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({ error: { message: resposta.statusText } }));
      console.error(`${VERMELHO}[ERROR] ${erro.error?.message || resposta.statusText}${RESET}`);
      process.exit(1);
    }

    const json = await resposta.json();
    const items: ConteudoItem[] = json.data ?? json;

    if (items.length === 0) {
      console.log(`${AMARELO}Nenhum conteudo encontrado no projeto "${projeto}"${RESET}`);
      return;
    }

    const larguraTipo = Math.max(...items.map((i) => i.type.length), 4);
    const larguraTitulo = Math.max(...items.map((i) => i.title.length), 5);
    const larguraSlug = Math.max(...items.map((i) => i.slug.length), 4);

    const cabecalho = `${NEGRITO}${'TIPO'.padEnd(larguraTipo)}  ${'TITULO'.padEnd(larguraTitulo)}  ${'SLUG'.padEnd(larguraSlug)}  VER   TAGS${RESET}`;
    console.log(cabecalho);
    console.log('-'.repeat(cabecalho.length));

    for (const item of items) {
      const tipo = item.type.padEnd(larguraTipo);
      const titulo = item.title.padEnd(larguraTitulo);
      const slug = item.slug.padEnd(larguraSlug);
      const versao = String(item.version ?? 1).padStart(3);
      const tags = item.tags.length > 0 ? `${CINZA}${item.tags.join(', ')}${RESET}` : `${CINZA}-${RESET}`;

      console.log(`${VERDE}${tipo}${RESET}  ${titulo}  ${CINZA}${slug}${RESET}  ${versao}   ${tags}`);
    }

    console.log(`\n${CINZA}Total: ${items.length} item(ns)${RESET}`);
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('fetch')) {
      console.error(`${VERMELHO}[ERROR] Nao foi possivel conectar ao servidor${RESET}`);
    } else {
      throw erro;
    }
    process.exit(1);
  }
}
