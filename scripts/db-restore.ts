import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('[ERROR] Informe o caminho do backup SQL.');
  console.error('[INFO] Uso: pnpm db:restore backups/myinst-2026-01-01.sql');
  process.exit(1);
}

if (process.env.MYINST_CONFIRM_RESTORE !== 'CONFIRMO_RESTORE') {
  console.error('[ERROR] Restore bloqueado. Defina MYINST_CONFIRM_RESTORE=CONFIRMO_RESTORE para continuar.');
  process.exit(1);
}

const dbUser = process.env.DB_USER || 'myinst_user';
const dbName = process.env.DB_NAME || 'myinst';
const container = process.env.POSTGRES_CONTAINER || 'shared-postgres';
const conteudo = readFileSync(arquivo, 'utf-8');

const restore = spawnSync('docker', [
  'exec',
  '-i',
  container,
  'psql',
  '-U',
  dbUser,
  dbName,
], {
  input: conteudo,
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
});

if (restore.status !== 0) {
  process.exit(restore.status || 1);
}

console.log('[SUCCESS] Restore concluído.');
