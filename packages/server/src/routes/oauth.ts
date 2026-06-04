import type { FastifyInstance } from 'fastify';
import oauthPlugin from '@fastify/oauth2';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, oauthAccounts } from '../db/schema.js';
import { obterWorkspaceDefault } from '../lib/workspaces.js';

interface OAuthUserProfile {
  email: string;
  name: string;
  avatarUrl?: string;
  providerAccountId: string;
}

async function obterPerfilGoogle(accessToken: string): Promise<OAuthUserProfile> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Falha ao obter perfil do Google');
  }

  const perfil = await response.json() as { id: string; email: string; name: string; picture?: string };

  return {
    email: perfil.email,
    name: perfil.name,
    avatarUrl: perfil.picture,
    providerAccountId: perfil.id,
  };
}

async function obterPerfilGithub(accessToken: string): Promise<OAuthUserProfile> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Falha ao obter perfil do GitHub');
  }

  const perfil = await response.json() as { id: number; login: string; name?: string; avatar_url?: string; email?: string };

  let email = perfil.email;
  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (emailsResponse.ok) {
      const emails = await emailsResponse.json() as { email: string; primary: boolean; verified: boolean }[];
      const emailPrimario = emails.find(e => e.primary && e.verified);
      email = emailPrimario?.email ?? emails[0]?.email;
    }
  }

  if (!email) {
    throw new Error('Nenhum email encontrado na conta GitHub');
  }

  return {
    email,
    name: perfil.name ?? perfil.login,
    avatarUrl: perfil.avatar_url,
    providerAccountId: String(perfil.id),
  };
}

async function processarLoginOAuth(
  app: FastifyInstance,
  provider: 'google' | 'github',
  perfil: OAuthUserProfile,
): Promise<string> {
  const [contaOAuth] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(
      eq(oauthAccounts.provider, provider),
      eq(oauthAccounts.providerAccountId, perfil.providerAccountId),
    ))
    .limit(1);

  if (contaOAuth) {
    const [usuario] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, contaOAuth.userId))
      .limit(1);

    await obterWorkspaceDefault(usuario.id);

    return app.jwt.sign(
      { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
      { expiresIn: '7d' },
    );
  }

  const [usuarioExistente] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.email, perfil.email))
    .limit(1);

  if (usuarioExistente) {
    await obterWorkspaceDefault(usuarioExistente.id);

    await db.insert(oauthAccounts).values({
      userId: usuarioExistente.id,
      provider,
      providerAccountId: perfil.providerAccountId,
      email: perfil.email,
    });

    return app.jwt.sign(
      { id: usuarioExistente.id, email: usuarioExistente.email, displayName: usuarioExistente.displayName },
      { expiresIn: '7d' },
    );
  }

  const [novoUsuario] = await db.insert(users).values({
    email: perfil.email,
    displayName: perfil.name,
    passwordHash: null,
    avatarUrl: perfil.avatarUrl,
  }).returning();

  await db.insert(oauthAccounts).values({
    userId: novoUsuario.id,
    provider,
    providerAccountId: perfil.providerAccountId,
    email: perfil.email,
  });

  await obterWorkspaceDefault(novoUsuario.id);

  return app.jwt.sign(
    { id: novoUsuario.id, email: novoUsuario.email, displayName: novoUsuario.displayName },
    { expiresIn: '7d' },
  );
}

export async function oauthRoutes(app: FastifyInstance) {
  const callbackBase = process.env.OAUTH_CALLBACK_URL || 'http://localhost:3000';

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    await app.register(oauthPlugin, {
      name: 'googleOAuth2',
      scope: ['profile', 'email'],
      credentials: {
        client: {
          id: process.env.GOOGLE_CLIENT_ID,
          secret: process.env.GOOGLE_CLIENT_SECRET,
        },
      },
      startRedirectPath: '/oauth/google',
      callbackUri: `${callbackBase}/api/v1/auth/oauth/google/callback`,
      discovery: {
        issuer: 'https://accounts.google.com',
      },
    });

    app.get('/oauth/google/callback', async (request, reply) => {
      const googleOAuth2 = (app as any).googleOAuth2;
      const { token } = await googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const perfil = await obterPerfilGoogle(token.access_token);
      const jwt = await processarLoginOAuth(app, 'google', perfil);

      return reply.send({ data: { token: jwt } });
    });
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    await app.register(oauthPlugin, {
      name: 'githubOAuth2',
      scope: ['user:email'],
      credentials: {
        client: {
          id: process.env.GITHUB_CLIENT_ID,
          secret: process.env.GITHUB_CLIENT_SECRET,
        },
        auth: oauthPlugin.GITHUB_CONFIGURATION,
      },
      startRedirectPath: '/oauth/github',
      callbackUri: `${callbackBase}/api/v1/auth/oauth/github/callback`,
    });

    app.get('/oauth/github/callback', async (request, reply) => {
      const githubOAuth2 = (app as any).githubOAuth2;
      const { token } = await githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const perfil = await obterPerfilGithub(token.access_token);
      const jwt = await processarLoginOAuth(app, 'github', perfil);

      return reply.send({ data: { token: jwt } });
    });
  }
}
