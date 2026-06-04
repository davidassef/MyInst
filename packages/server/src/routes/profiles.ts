import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { modelProfiles } from '../db/schema.js';
import { criarPerfilSchema, atualizarPerfilSchema } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';

export async function profileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/', async (request) => {
    const lista = await db
      .select()
      .from(modelProfiles)
      .where(eq(modelProfiles.userId, request.user.id));

    return { data: lista };
  });

  app.post('/', { preHandler: [validar(criarPerfilSchema)] }, async (request, reply) => {
    const { name, modelPattern, tags } = request.body as { name: string; modelPattern: string; tags: string[] };

    const [existente] = await db
      .select({ id: modelProfiles.id })
      .from(modelProfiles)
      .where(and(eq(modelProfiles.userId, request.user.id), eq(modelProfiles.name, name)))
      .limit(1);

    if (existente) {
      return reply.status(409).send({
        error: { code: 'PROFILE_EXISTS', message: `Perfil '${name}' já existe`, status: 409 },
      });
    }

    const [perfil] = await db.insert(modelProfiles).values({
      userId: request.user.id,
      name,
      modelPattern,
      tags,
    }).returning();

    return reply.status(201).send({ data: perfil });
  });

  app.patch('/:id', { preHandler: [validar(atualizarPerfilSchema)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Record<string, unknown>;

    const [perfil] = await db
      .select()
      .from(modelProfiles)
      .where(and(eq(modelProfiles.id, id), eq(modelProfiles.userId, request.user.id)))
      .limit(1);

    if (!perfil) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Perfil não encontrado', status: 404 },
      });
    }

    const [atualizado] = await db
      .update(modelProfiles)
      .set(updates)
      .where(eq(modelProfiles.id, id))
      .returning();

    return { data: atualizado };
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(modelProfiles)
      .where(and(eq(modelProfiles.id, id), eq(modelProfiles.userId, request.user.id)))
      .returning({ id: modelProfiles.id });

    if (!deleted) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Perfil não encontrado', status: 404 },
      });
    }

    return reply.status(204).send();
  });

  app.get('/match', async (request, reply) => {
    const { model } = request.query as { model?: string };

    if (!model) {
      return reply.status(400).send({
        error: { code: 'MISSING_PARAM', message: 'Parâmetro "model" é obrigatório', status: 400 },
      });
    }

    const perfis = await db
      .select()
      .from(modelProfiles)
      .where(eq(modelProfiles.userId, request.user.id));

    const encontrado = perfis.find((perfil) => {
      try {
        const regex = new RegExp(perfil.modelPattern, 'i');
        return regex.test(model);
      } catch {
        return false;
      }
    });

    if (!encontrado) {
      return reply.status(404).send({
        error: { code: 'NO_MATCH', message: `Nenhum perfil corresponde ao modelo "${model}"`, status: 404 },
      });
    }

    return { data: encontrado };
  });
}
