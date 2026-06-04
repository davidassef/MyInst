import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, folders } from '../db/schema.js';
import { criarProjetoSchema, atualizarProjetoSchema, criarFolderSchema } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { verificarLimiteProjetos } from '../middleware/usage.js';

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/', async (request) => {
    const lista = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, request.user.id));

    return { data: lista };
  });

  app.post('/', { preHandler: [validar(criarProjetoSchema), verificarLimiteProjetos] }, async (request, reply) => {
    const { name, slug, description } = request.body as { name: string; slug: string; description?: string };

    const [existente] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, slug)))
      .limit(1);

    if (existente) {
      return reply.status(409).send({
        error: { code: 'SLUG_EXISTS', message: `Projeto com slug '${slug}' já existe`, status: 409 },
      });
    }

    const [projeto] = await db.insert(projects).values({
      userId: request.user.id,
      name,
      slug,
      description,
    }).returning();

    return reply.status(201).send({ data: projeto });
  });

  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const [projeto] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, slug)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    return { data: projeto };
  });

  app.patch('/:slug', { preHandler: [validar(atualizarProjetoSchema)] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const updates = request.body as Record<string, unknown>;

    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, slug)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [atualizado] = await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, projeto.id))
      .returning();

    return { data: atualizado };
  });

  app.delete('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const [projeto] = await db
      .select({ id: projects.id, isDefault: projects.isDefault })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, slug)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    if (projeto.isDefault) {
      return reply.status(400).send({
        error: { code: 'CANNOT_DELETE_DEFAULT', message: 'Não é possível deletar o projeto padrão', status: 400 },
      });
    }

    await db.delete(projects).where(eq(projects.id, projeto.id));
    return reply.status(204).send();
  });

  // Folders
  app.get('/:slug/folders', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, slug)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const lista = await db.select().from(folders).where(eq(folders.projectId, projeto.id));
    return { data: lista };
  });

  app.post('/:slug/folders', { preHandler: [validar(criarFolderSchema)] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { name, slug: folderSlug, sortOrder } = request.body as { name: string; slug: string; sortOrder: number };

    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, slug)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [folder] = await db.insert(folders).values({
      projectId: projeto.id,
      name,
      slug: folderSlug,
      sortOrder,
    }).returning();

    return reply.status(201).send({ data: folder });
  });

  app.delete('/:slug/folders/:folderId', async (request, reply) => {
    const { slug, folderId } = request.params as { slug: string; folderId: string };

    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, slug)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.projectId, projeto.id)));
    return reply.status(204).send();
  });
}
