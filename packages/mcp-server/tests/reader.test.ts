import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerConteudoLocal } from '../src/reader/index.js';

describe('Reader', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'myinst-reader-'));

    await mkdir(join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(join(tempDir, '.claude', 'agents'), { recursive: true });
    await mkdir(join(tempDir, '.claude', 'memory'), { recursive: true });
    await mkdir(join(tempDir, '.claude', 'snippets'), { recursive: true });

    await writeFile(join(tempDir, '.claude', 'skills', 'tdd.md'), 'Escreva testes primeiro.');
    await writeFile(join(tempDir, '.claude', 'skills', 'clean-code.md'), 'Mantenha funções pequenas.');
    await writeFile(join(tempDir, '.claude', 'agents', 'reviewer.md'), 'Revise com foco em segurança.');
    await writeFile(join(tempDir, '.claude', 'memory', 'contexto-projeto.md'), 'Projeto usa Fastify.');
    await writeFile(join(tempDir, '.claude', 'snippets', 'error-handler.md'), 'try/catch padrão.');
    await writeFile(join(tempDir, '.claude', 'CLAUDE.md'), 'Instruções gerais do projeto.');
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('lê skills do diretório .claude/skills/', async () => {
    const itens = await lerConteudoLocal(tempDir);
    const skills = itens.filter((i) => i.type === 'skill');

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.slug).sort()).toEqual(['clean-code', 'tdd']);
  });

  it('lê agents do diretório .claude/agents/', async () => {
    const itens = await lerConteudoLocal(tempDir);
    const agents = itens.filter((i) => i.type === 'agent');

    expect(agents).toHaveLength(1);
    expect(agents[0].slug).toBe('reviewer');
    expect(agents[0].body).toBe('Revise com foco em segurança.');
  });

  it('lê memory do diretório .claude/memory/', async () => {
    const itens = await lerConteudoLocal(tempDir);
    const memorias = itens.filter((i) => i.type === 'memory');

    expect(memorias).toHaveLength(1);
    expect(memorias[0].slug).toBe('contexto-projeto');
  });

  it('lê snippets do diretório .claude/snippets/', async () => {
    const itens = await lerConteudoLocal(tempDir);
    const snippets = itens.filter((i) => i.type === 'snippet');

    expect(snippets).toHaveLength(1);
    expect(snippets[0].slug).toBe('error-handler');
  });

  it('lê CLAUDE.md como tipo instruction', async () => {
    const itens = await lerConteudoLocal(tempDir);
    const instrucoes = itens.filter((i) => i.type === 'instruction');

    expect(instrucoes).toHaveLength(1);
    expect(instrucoes[0].slug).toBe('claude');
    expect(instrucoes[0].body).toBe('Instruções gerais do projeto.');
  });

  it('gera título a partir do slug', async () => {
    const itens = await lerConteudoLocal(tempDir);
    const cleanCode = itens.find((i) => i.slug === 'clean-code');

    expect(cleanCode?.title).toBe('Clean Code');
  });

  it('retorna array vazio para diretório sem .claude/', async () => {
    const dirVazio = await mkdtemp(join(tmpdir(), 'myinst-vazio-'));
    const itens = await lerConteudoLocal(dirVazio);

    expect(itens).toHaveLength(0);
    await rm(dirVazio, { recursive: true, force: true });
  });

  it('ignora arquivos não-markdown', async () => {
    await writeFile(join(tempDir, '.claude', 'skills', 'config.json'), '{}');
    const itens = await lerConteudoLocal(tempDir);
    const skills = itens.filter((i) => i.type === 'skill');

    expect(skills).toHaveLength(2);
  });

  it('cada item possui metadata vazio e tags vazio', async () => {
    const itens = await lerConteudoLocal(tempDir);

    for (const item of itens) {
      expect(item.metadata).toEqual({});
      expect(item.tags).toEqual([]);
    }
  });
});
