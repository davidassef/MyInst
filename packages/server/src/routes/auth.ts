import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users, apiKeys, plans } from '../db/schema.js';
import { registrarUsuarioSchema, loginSchema, criarApiKeySchema, API_KEY_PREFIX } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { verificarLimiteApiKeys } from '../middleware/usage.js';
import { obterWorkspaceDefault } from '../lib/workspaces.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [validar(registrarUsuarioSchema)],
  }, async (request, reply) => {
    const { email, password, displayName } = request.body as { email: string; password: string; displayName: string };

    const [existente] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existente) {
      return reply.status(409).send({
        error: { code: 'EMAIL_EXISTS', message: 'Email já cadastrado', status: 409 },
      });
    }

    const [planoFree] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.name, 'free'))
      .limit(1);

    const passwordHash = await bcrypt.hash(password, 12);
    const [usuario] = await db.insert(users).values({
      email,
      displayName,
      passwordHash,
      planId: planoFree?.id ?? null,
    }).returning();

    await obterWorkspaceDefault(usuario.id);

    const token = app.jwt.sign(
      { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
      { expiresIn: '7d' },
    );

    return reply.status(201).send({
      data: {
        user: { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
        token,
      },
    });
  });

  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [validar(loginSchema)],
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [usuario] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!usuario || !usuario.passwordHash) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos', status: 401 },
      });
    }

    const senhaValida = await bcrypt.compare(password, usuario.passwordHash);
    if (!senhaValida) {
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos', status: 401 },
      });
    }

    await obterWorkspaceDefault(usuario.id);

    const token = app.jwt.sign(
      { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
      { expiresIn: '7d' },
    );

    return reply.send({
      data: {
        user: { id: usuario.id, email: usuario.email, displayName: usuario.displayName },
        token,
      },
    });
  });

  app.get('/me', { preHandler: [autenticar] }, async (request) => {
    const [usuario] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, request.user.id))
      .limit(1);

    return { data: usuario };
  });

  app.post('/api-keys', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    preHandler: [autenticar, validar(criarApiKeySchema), verificarLimiteApiKeys],
  }, async (request, reply) => {
    const { name, scopes, expiresAt } = request.body as { name: string; scopes: string[]; expiresAt?: string };

    const rawKey = `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
    const keyPrefix = rawKey.slice(0, 14);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const [apiKey] = await db.insert(apiKeys).values({
      userId: request.user.id,
      name,
      keyPrefix,
      keyHash,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();

    return reply.status(201).send({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
    });
  });

  app.get('/api-keys', { preHandler: [autenticar] }, async (request) => {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, request.user.id));

    return { data: keys };
  });

  app.delete('/api-keys/:id', { preHandler: [autenticar] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, request.user.id)))
      .returning({ id: apiKeys.id });

    if (!deleted) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'API key não encontrada', status: 404 },
      });
    }

    return reply.status(204).send();
  });
}
