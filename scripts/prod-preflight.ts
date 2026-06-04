import { spawnSync } from 'node:child_process';

const jwtSecret = process.env.JWT_SECRET || 'preflight-secret-local-com-mais-de-32-caracteres';

const comandos = [
  ['pnpm', ['validate']],
  ['pnpm', ['compose:check']],
  ['docker', ['compose', 'build']],
  ['docker', ['compose', 'up', '-d', '--wait', 'db']],
  ['pnpm', ['db:deploy:schema']],
  ['docker', ['compose', 'up', '-d', '--wait', '--build', 'myinst'], {
    NODE_ENV: 'production',
    JWT_SECRET: jwtSecret,
    APP_URL: 'http://localhost:3000',
    API_PUBLIC_URL: 'http://localhost:3000',
    CORS_ORIGIN: 'http://localhost:3000',
    WEB_OAUTH_SUCCESS_URL: 'http://localhost:3000/login',
    OAUTH_CALLBACK_URL: 'http://localhost:3000',
  }],
  ['pnpm', ['smoke'], { MYINST_SMOKE_BASE_URL: 'http://localhost:3000' }],
] as const;

for (const [comando, args, envExtra] of comandos) {
  executar(comando, args, envExtra);
}

executar('docker', ['compose', 'down']);

console.log('[SUCCESS] Preflight de produção local concluído.');

function executar(comando: string, args: readonly string[], envExtra: NodeJS.ProcessEnv = {}) {
  console.log(`[INFO] ${comando} ${args.join(' ')}`);

  const resultado = spawnSync(comando, [...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...envExtra,
    },
  });

  if (resultado.status === 0) return;

  if (comando !== 'docker' || args[0] !== 'compose' || args[1] !== 'down') {
    spawnSync('docker', ['compose', 'down'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });
  }

  process.exit(resultado.status || 1);
}
