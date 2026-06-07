import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workspaces } from '../db/schema.js';
import { criarWorkspaceSchema, atualizarWorkspaceSchema } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { garantirProjetoDefault, obterWorkspaceDefault, resolverWorkspaceDoUsuario } from '../lib/workspaces.js';

export async function workspaceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/workspaces', async (request) => {
    await obterWorkspaceDefault(request.user.id);

    const lista = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, request.user.id));

    return { data: lista };
  });

  app.post('/workspaces', { preHandler: [validar(criarWorkspaceSchema)] }, async (request, reply) => {
    const { name, slug, description } = request.body as { name: string; slug: string; description?: string };

    const [existente] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.userId, request.user.id), eq(workspaces.slug, slug)))
      .limit(1);

    if (existente) {
      return reply.status(409).send({
        error: { code: 'SLUG_EXISTS', message: `Workspace com slug '${slug}' já existe`, status: 409 },
      });
    }

    const [workspace] = await db
      .insert(workspaces)
      .values({
        userId: request.user.id,
        name,
        slug,
        description,
        isDefault: false,
      })
      .returning();

    await garantirProjetoDefault(workspace.id, request.user.id);

    return reply.status(201).send({ data: workspace });
  });

  app.get('/workspaces/:workspaceSlug', async (request, reply) => {
    const { workspaceSlug } = request.params as { workspaceSlug: string };
    const workspace = await resolverWorkspaceDoUsuario(request.user.id, workspaceSlug);

    if (!workspace) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Workspace não encontrado', status: 404 },
      });
    }

    return { data: workspace };
  });

  app.patch('/workspaces/:workspaceSlug', { preHandler: [validar(atualizarWorkspaceSchema)] }, async (request, reply) => {
    const { workspaceSlug } = request.params as { workspaceSlug: string };
    const updates = request.body as { name?: string; slug?: string; description?: string };
    const workspace = await resolverWorkspaceDoUsuario(request.user.id, workspaceSlug);

    if (!workspace) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Workspace não encontrado', status: 404 },
      });
    }

    if (updates.slug && updates.slug !== workspace.slug) {
      const [existente] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.userId, request.user.id), eq(workspaces.slug, updates.slug)))
        .limit(1);

      if (existente) {
        return reply.status(409).send({
          error: { code: 'SLUG_EXISTS', message: `Workspace com slug '${updates.slug}' já existe`, status: 409 },
        });
      }
    }

    const payload = {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.slug !== undefined ? { slug: updates.slug } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      updatedAt: new Date(),
    };

    const [atualizado] = await db
      .update(workspaces)
      .set(payload)
      .where(eq(workspaces.id, workspace.id))
      .returning();

    return { data: atualizado };
  });

  app.delete('/workspaces/:workspaceSlug', async (request, reply) => {
    const { workspaceSlug } = request.params as { workspaceSlug: string };
    const workspace = await resolverWorkspaceDoUsuario(request.user.id, workspaceSlug);

    if (!workspace) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Workspace não encontrado', status: 404 },
      });
    }

    if (workspace.isDefault) {
      return reply.status(400).send({
        error: { code: 'CANNOT_DELETE_DEFAULT', message: 'Não é possível deletar o workspace padrão', status: 400 },
      });
    }

    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
    return reply.status(204).send();
  });
}
