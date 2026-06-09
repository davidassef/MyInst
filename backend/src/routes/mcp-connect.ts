import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { autenticar } from '../middleware/auth.js';
import { API_KEY_PREFIX } from '@myinst/shared';

export async function mcpConnectRoutes(app: FastifyInstance) {
  app.post('/token', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    preHandler: [autenticar],
  }, async (request, reply) => {
    const nomeData = new Date().toISOString().split('T')[0];
    const name = `MCP Server - ${nomeData}`;

    const rawKey = `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
    const keyPrefix = rawKey.slice(0, 14);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const [apiKey] = await db.insert(apiKeys).values({
      userId: request.user.id,
      name,
      keyPrefix,
      keyHash,
      scopes: ['read', 'write'],
    }).returning();

    return reply.status(201).send({
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        createdAt: apiKey.createdAt,
      },
    });
  });
}
