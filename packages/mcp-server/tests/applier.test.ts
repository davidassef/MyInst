import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { aplicarConteudo } from '../src/applier/index.js';

function normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

describe('Applier', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'myinst-test-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('aplica skill como .md em .claude/skills/', async () => {
    const items = [{
      id: '1',
      type: 'skill',
      title: 'TDD',
      slug: 'tdd',
      description: null,
      body: 'Escreva testes primeiro.',
      metadata: {},
      tags: ['claude-opus'],
    }];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(1);
    expect(normalizePath(resultado[0].path)).toContain('.claude/skills/tdd.md');

    const conteudo = await readFile(resultado[0].path, 'utf-8');
    expect(conteudo).toBe('Escreva testes primeiro.');
  });

  it('aplica instruction como CLAUDE.md em .claude/', async () => {
    const items = [{
      id: '2',
      type: 'instruction',
      title: 'Regras Base',
      slug: 'regras-base',
      description: null,
      body: 'Use early return sempre.',
      metadata: {},
      tags: [],
    }];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].path).toContain('CLAUDE.md');

    const conteudo = await readFile(resultado[0].path, 'utf-8');
    expect(conteudo).toContain('# Regras Base');
    expect(conteudo).toContain('Use early return sempre.');
  });

  it('aplica agent como .md em .claude/agents/', async () => {
    const items = [{
      id: '3',
      type: 'agent',
      title: 'Code Reviewer',
      slug: 'code-reviewer',
      description: null,
      body: 'Revise código com foco em segurança.',
      metadata: {},
      tags: [],
    }];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(1);
    expect(normalizePath(resultado[0].path)).toContain('.claude/agents/code-reviewer.md');
  });

  it('aplica múltiplos itens de uma vez', async () => {
    const items = [
      { id: '4', type: 'skill', title: 'Debug', slug: 'debug', description: null, body: 'Debug skill', metadata: {}, tags: [] },
      { id: '5', type: 'memory', title: 'Contexto', slug: 'contexto', description: null, body: 'Memoria', metadata: {}, tags: [] },
    ];

    const resultado = await aplicarConteudo(items, tempDir);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].path).toContain('debug.md');
    expect(resultado[1].path).toContain('contexto.md');
  });
});
