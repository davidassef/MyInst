import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

export interface EstruturasConhecidas {
  encontrados: string[];
  tiposEsperados: string[];
}

export async function detectarEstruturasConhecidas(diretorioBase: string): Promise<EstruturasConhecidas> {
  const checks = await Promise.all([
    existe(join(diretorioBase, '.claude', 'skills')),
    existe(join(diretorioBase, '.claude', 'agents')),
    existe(join(diretorioBase, '.claude', 'memory')),
    existe(join(diretorioBase, '.claude', 'snippets')),
    existe(join(diretorioBase, '.claude', 'hooks')),
    existe(join(diretorioBase, '.claude', 'CLAUDE.md')),
    existe(join(diretorioBase, '.claude', '.mcp.json')),
    existe(join(diretorioBase, '.codex', 'skills')),
    existe(join(diretorioBase, '.codex', 'AGENTS.md')),
    existe(join(diretorioBase, 'AGENTS.md')),
    existe(join(diretorioBase, 'CLAUDE.md')),
    existe(join(diretorioBase, '.mcp.json')),
  ]);

  const encontrados: string[] = [];
  const tipos = new Set<string>();

  registrar(checks[0], '.claude/skills', 'skill');
  registrar(checks[1], '.claude/agents', 'agent');
  registrar(checks[2], '.claude/memory', 'memory');
  registrar(checks[3], '.claude/snippets', 'snippet');
  registrar(checks[4], '.claude/hooks', 'hook');
  registrar(checks[5], '.claude/CLAUDE.md', 'instruction');
  registrar(checks[6], '.claude/.mcp.json', 'mcp_config');
  registrar(checks[7], '.codex/skills', 'skill');
  registrar(checks[8], '.codex/AGENTS.md', 'instruction');
  registrar(checks[9], 'AGENTS.md', 'instruction');
  registrar(checks[10], 'CLAUDE.md', 'instruction');
  registrar(checks[11], '.mcp.json', 'mcp_config');

  return {
    encontrados,
    tiposEsperados: [...tipos],
  };

  function registrar(existeEstrutura: boolean, label: string, tipo: string) {
    if (!existeEstrutura) return;
    encontrados.push(label);
    tipos.add(tipo);
  }
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await access(caminho, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
