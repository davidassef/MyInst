import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const diretorioTemp = join(tmpdir(), `myinst-test-${Date.now()}`);
const configPath = join(diretorioTemp, '.myinst', 'config.json');

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => diretorioTemp,
  };
});

const { carregarConfig, salvarConfig, limparConfig, obterConfigPath } = await import('../src/config.js');

describe('config', () => {
  beforeEach(() => {
    mkdirSync(diretorioTemp, { recursive: true });
  });

  afterEach(() => {
    rmSync(diretorioTemp, { recursive: true, force: true });
  });

  it('obterConfigPath retorna caminho correto', () => {
    const caminho = obterConfigPath();
    expect(caminho).toBe(configPath);
  });

  it('salvarConfig grava arquivo corretamente', () => {
    const config = { server: 'http://localhost:3000', apiKey: 'test-key-123' };

    salvarConfig(config);

    const conteudo = readFileSync(configPath, 'utf-8');
    expect(JSON.parse(conteudo)).toEqual(config);
  });

  it('carregarConfig le arquivo corretamente', () => {
    const config = { server: 'http://meuservidor.com', apiKey: 'minha-chave' };
    salvarConfig(config);

    const resultado = carregarConfig();

    expect(resultado).toEqual(config);
  });

  it('carregarConfig retorna null quando arquivo nao existe', () => {
    const resultado = carregarConfig();
    expect(resultado).toBeNull();
  });

  it('limparConfig remove o arquivo', () => {
    salvarConfig({ server: 'http://localhost:3000', apiKey: 'key' });
    expect(existsSync(configPath)).toBe(true);

    limparConfig();

    expect(existsSync(configPath)).toBe(false);
  });

  it('limparConfig nao falha quando arquivo nao existe', () => {
    expect(() => limparConfig()).not.toThrow();
  });
});
