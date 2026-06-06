import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

export interface ConfiguracaoAmbiente {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  appUrl: string;
  apiPublicUrl: string;
  corsOrigin: string;
  webOAuthSuccessUrl: string;
  oauthCallbackUrl: string;
}

const PLACEHOLDERS_SECRET = [
  'troque-por-um-secret-seguro-em-producao',
  'TROCAR_POR_SECRET_LONGO_ALEATORIO',
  'test-secret',
  'secret',
];

export function carregarAmbiente(env: NodeJS.ProcessEnv = process.env): ConfiguracaoAmbiente {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const appUrl = env.APP_URL || (isProduction ? '' : 'http://localhost:5173');
  const apiPublicUrl = env.API_PUBLIC_URL || env.OAUTH_CALLBACK_URL || (isProduction ? '' : 'http://localhost:3000');
  const corsOrigin = env.CORS_ORIGIN || appUrl;
  const webOAuthSuccessUrl = env.WEB_OAUTH_SUCCESS_URL || `${appUrl}/login`;
  const oauthCallbackUrl = env.OAUTH_CALLBACK_URL || apiPublicUrl;

  const configuracao: ConfiguracaoAmbiente = {
    nodeEnv,
    isProduction,
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL || '',
    jwtSecret: env.JWT_SECRET || '',
    appUrl,
    apiPublicUrl,
    corsOrigin,
    webOAuthSuccessUrl,
    oauthCallbackUrl,
  };

  validarAmbiente(configuracao);

  return configuracao;
}

function validarAmbiente(configuracao: ConfiguracaoAmbiente) {
  if (!configuracao.isProduction) return;

  const erros: string[] = [];

  if (!configuracao.databaseUrl) {
    erros.push('DATABASE_URL é obrigatório em produção.');
  }

  if (!configuracao.jwtSecret) {
    erros.push('JWT_SECRET é obrigatório em produção.');
  }

  if (configuracao.jwtSecret.length < 32) {
    erros.push('JWT_SECRET deve ter pelo menos 32 caracteres em produção.');
  }

  if (PLACEHOLDERS_SECRET.includes(configuracao.jwtSecret)) {
    erros.push('JWT_SECRET não pode usar valor placeholder em produção.');
  }

  if (!configuracao.appUrl) {
    erros.push('APP_URL é obrigatório em produção.');
  }

  if (!configuracao.apiPublicUrl) {
    erros.push('API_PUBLIC_URL é obrigatório em produção.');
  }

  if (!configuracao.corsOrigin) {
    erros.push('CORS_ORIGIN é obrigatório em produção.');
  }

  if (erros.length > 0) {
    throw new Error(`Configuração de produção inválida:\n${erros.join('\n')}`);
  }
}
