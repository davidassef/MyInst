import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const backupDir = process.env.MYINST_BACKUP_DIR || 'backups';
const dbUser = process.env.DB_USER || 'myinst_user';
const dbName = process.env.DB_NAME || 'myinst';
const container = process.env.POSTGRES_CONTAINER || 'shared-postgres';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const arquivo = join(backupDir, `myinst-${timestamp}.sql`);

mkdirSync(backupDir, { recursive: true });

const dump = spawnSync('docker', [
  'exec',
  container,
  'pg_dump',
  '-U',
  dbUser,
  dbName,
], {
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});

if (dump.status !== 0) {
  process.stderr.write(dump.stderr);
  process.exit(dump.status || 1);
}

await import('node:fs/promises').then(({ writeFile }) => writeFile(arquivo, dump.stdout, 'utf-8'));
console.log(`[SUCCESS] Backup criado em ${arquivo}`);
