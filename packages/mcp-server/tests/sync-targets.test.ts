import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('sync targets', () => {
  let tempDir: string;
  let tempHome: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'myinst-sync-project-'));
    tempHome = await mkdtemp(join(tmpdir(), 'myinst-sync-home-'));

    await mkdir(join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(join(tempDir, '.cursor', 'rules'), { recursive: true });
    await mkdir(join(tempDir, '.codex', 'skills', 'infra-local'), { recursive: true });
    await mkdir(join(tempHome, '.codex', 'skills', 'global-skill'), { recursive: true });

    await writeFile(join(tempDir, '.claude', 'skills', 'tdd.md'), 'Skill TDD');
    await writeFile(join(tempDir, '.claude', 'CLAUDE.md'), 'Instruções Claude');
    await writeFile(join(tempDir, '.cursor', 'rules', 'backend.mdc'), 'Regra Cursor');
    await writeFile(join(tempDir, '.cursor', 'mcp.json'), '{"servers":{}}');
    await writeFile(join(tempDir, '.codex', 'skills', 'infra-local', 'SKILL.md'), 'Skill Codex');
    await writeFile(join(tempDir, '.codex', 'AGENTS.md'), 'Agentes Codex');

    await writeFile(join(tempHome, '.codex', 'AGENTS.md'), 'Global Codex');
    await writeFile(join(tempHome, '.codex', 'config.toml'), '[mcp_servers]');
    await writeFile(join(tempHome, '.codex', 'skills', 'global-skill', 'SKILL.md'), 'Skill Global');
  });

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('node:os', async () => {
      const actual = await vi.importActual<typeof import('node:os')>('node:os');
      return {
        ...actual,
        homedir: () => tempHome,
      };
    });
  });

  afterAll(async () => {
    vi.resetModules();
    vi.doUnmock('node:os');
    await rm(tempDir, { recursive: true, force: true });
    await rm(tempHome, { recursive: true, force: true });
  });

  it('detecta múltiplos clientes no projeto e exige seleção explícita quando necessário', async () => {
    const modulo = await importarModulo();
    const resolucao = await modulo.resolverSelecaoSync(tempDir, 'project');

    expect(resolucao.requiresClientSelection).toBe(true);
    expect(resolucao.availableTargets.map((target) => target.clientId).sort()).toEqual(['claude', 'codex', 'cursor']);
    expect(resolucao.selectedTargets).toHaveLength(0);
  });

  it('lista projeto e global quando o escopo é all', async () => {
    const modulo = await importarModulo();
    const targets = await modulo.listarSyncTargets(tempDir, 'all', ['codex']);

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.scope).sort()).toEqual(['global', 'project']);
  });

  it('importa apenas o cliente selecionado', async () => {
    const modulo = await importarModulo();
    const importacao = await modulo.importarTargetsDetectados(tempDir, 'project', ['cursor']);

    expect(importacao.targets).toHaveLength(1);
    expect(importacao.targets[0].clientId).toBe('cursor');
    expect(importacao.items.map((item) => item.type).sort()).toEqual(['instruction', 'mcp_config']);
  });

  it('escreve em formato nativo e reporta tipos ignorados sem suporte', async () => {
    const modulo = await importarModulo();
    const destino = await mkdtemp(join(tmpdir(), 'myinst-sync-destino-'));

    try {
      await mkdir(join(destino, '.cursor', 'rules'), { recursive: true });
      await writeFile(join(destino, '.cursor', 'mcp.json'), '{"existente":true}');

      const resultado = await modulo.exportarParaClientesNativos(destino, [
        {
          type: 'instruction',
          slug: 'backend-rule',
          title: 'Backend Rule',
          body: 'Regra nativa',
          metadata: {},
          tags: [],
        },
        {
          type: 'skill',
          slug: 'tdd',
          title: 'TDD',
          body: 'Skill não suportada pelo Cursor',
          metadata: {},
          tags: [],
        },
      ], 'project', ['cursor']);

      expect(resultado.targets).toHaveLength(1);
      expect(resultado.results[0].written).toHaveLength(1);
      expect(resultado.results[0].written[0].path).toContain('.cursor');
      expect(resultado.results[0].ignored).toEqual([
        expect.objectContaining({
          type: 'skill',
          slug: 'tdd',
        }),
      ]);
    } finally {
      await rm(destino, { recursive: true, force: true });
    }
  });
});

async function importarModulo() {
  return await import('../src/sync-targets/index.js');
}
