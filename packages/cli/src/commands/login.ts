import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { salvarConfig } from '../config.js';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const CINZA = '\x1b[90m';
const RESET = '\x1b[0m';

async function validarServidor(server: string, apiKey: string): Promise<boolean> {
  try {
    const resposta = await fetch(`${server}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

export async function executarLogin(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const server = (await rl.question(`${CINZA}URL do servidor (http://localhost:3000):${RESET} `)) || 'http://localhost:3000';
    const apiKey = await rl.question(`${CINZA}API Key:${RESET} `);

    if (!apiKey) {
      console.error(`${VERMELHO}[ERROR] API Key obrigatoria${RESET}`);
      process.exit(1);
    }

    const serverNormalizado = server.replace(/\/$/, '');

    process.stdout.write(`${CINZA}Validando credenciais...${RESET}`);
    const valido = await validarServidor(serverNormalizado, apiKey);

    if (!valido) {
      console.error(`\n${VERMELHO}[ERROR] Nao foi possivel conectar ao servidor ou API Key invalida${RESET}`);
      process.exit(1);
    }

    salvarConfig({ server: serverNormalizado, apiKey });
    console.log(`\n${VERDE}[SUCCESS] Autenticado com sucesso. Configuracao salva.${RESET}`);
  } finally {
    rl.close();
  }
}
