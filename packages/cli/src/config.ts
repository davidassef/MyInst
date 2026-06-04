import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

export interface MyInstConfig {
  server: string;
  apiKey: string;
}

export function obterConfigPath(): string {
  return join(homedir(), '.myinst', 'config.json');
}

export function carregarConfig(): MyInstConfig | null {
  const caminho = obterConfigPath();

  if (!existsSync(caminho)) return null;

  try {
    const conteudo = readFileSync(caminho, 'utf-8');
    return JSON.parse(conteudo) as MyInstConfig;
  } catch {
    return null;
  }
}

export function salvarConfig(config: MyInstConfig): void {
  const caminho = obterConfigPath();
  const dir = join(caminho, '..');

  mkdirSync(dir, { recursive: true });
  writeFileSync(caminho, JSON.stringify(config, null, 2), 'utf-8');
}

export function limparConfig(): void {
  const caminho = obterConfigPath();

  if (existsSync(caminho)) {
    rmSync(caminho);
  }
}
