import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tags } from '../db/schema.js';
import { criarTagSchema } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';

export async function tagRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/', async (request) => {
    const lista = await db
      .select()
      .from(tags)
      .where(eq(tags.userId, request.user.id));

    return { data: lista };
  });

  app.post('/', { preHandler: [validar(criarTagSchema)] }, async (request, reply) => {
    const { name, category, color } = request.body as { name: string; category: string; color?: string };

    const [existente] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, request.user.id), eq(tags.name, name)))
      .limit(1);

    if (existente) {
      return reply.status(409).send({
        error: { code: 'TAG_EXISTS', message: `Tag '${name}' já existe`, status: 409 },
      });
    }

    const [tag] = await db.insert(tags).values({
      userId: request.user.id,
      name,
      category: category as any,
      color,
    }).returning();

    return reply.status(201).send({ data: tag });
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, unknown>;

    const [tag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, request.user.id)))
      .limit(1);

    if (!tag) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Tag não encontrada', status: 404 },
      });
    }

    const [atualizada] = await db
      .update(tags)
      .set(updates)
      .where(eq(tags.id, id))
      .returning();

    return { data: atualizada };
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, request.user.id)))
      .returning({ id: tags.id });

    if (!deleted) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Tag não encontrada', status: 404 },
      });
    }

    return reply.status(204).send();
  });
}
