import { spawnSync } from 'node:child_process';

const composeFile = process.env.MYINST_COMPOSE_FILE || 'docker-compose.yml';
const envFile = process.env.MYINST_ENV_FILE;
const nomeServico = process.env.MYINST_SCHEMA_SERVICE || descobrirServico(composeFile);

const args = ['compose'];

if (envFile) {
  args.push('--env-file', envFile);
}

args.push(
  '-f',
  composeFile,
  'run',
  '--rm',
  '--build',
  nomeServico,
  'sh',
  '-lc',
  [
    'corepack prepare pnpm@10.28.0 --activate',
    'CI=true pnpm install --frozen-lockfile',
    'pnpm --filter @myinst/backend db:push',
  ].join(' && '),
);

const resultado = spawnSync('docker', args, {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

if (resultado.status === 0) {
  console.log('[SUCCESS] Schema aplicado com sucesso.');
  process.exit(0);
}

process.exit(resultado.status || 1);

function descobrirServico(arquivoCompose: string) {
  if (
    arquivoCompose.endsWith('docker-compose.vps.yml') ||
    arquivoCompose.endsWith('docker-compose.vps-api.yml') ||
    arquivoCompose.endsWith('docker-compose.vps-api-traefik.yml')
  ) {
    return 'myinst-api';
  }

  return 'myinst';
}
