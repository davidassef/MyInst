import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects, folders } from '../db/schema.js';
import { criarProjetoSchema, atualizarProjetoSchema, criarFolderSchema } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { verificarLimiteProjetos } from '../middleware/usage.js';
import { obterWorkspaceDefault, resolverWorkspaceDoUsuario } from '../lib/workspaces.js';

export async function projectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  async function resolverWorkspaceId(userId: string, workspaceSlug?: string) {
    const workspace = workspaceSlug
      ? await resolverWorkspaceDoUsuario(userId, workspaceSlug)
      : await obterWorkspaceDefault(userId);

    return workspace ?? null;
  }

  async function buscarProjeto(userId: string, slug: string, workspaceSlug?: string) {
    const workspace = await resolverWorkspaceId(userId, workspaceSlug);
    if (!workspace) return null;

    const [projeto] = await db
      .select()
      .from(projects)
      .where(and(
        eq(projects.userId, userId),
        eq(projects.workspaceId, workspace.id),
        eq(projects.slug, slug),
      ))
      .limit(1);

    return projeto ?? null;
  }

  async function listarProjetosDoWorkspace(userId: string, workspaceSlug?: string) {
    const workspace = await resolverWorkspaceId(userId, workspaceSlug);
    if (!workspace) return null;

    const lista = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.workspaceId, workspace.id)));

    return { workspace, lista };
  }

  app.get('/projects', async (request, reply) => {
    const resultado = await listarProjetosDoWorkspace(request.user.id);
    if (!resultado) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Workspace padrão não encontrado', status: 404 },
      });
    }

    return { data: resultado.lista };
  });

  app.post('/projects', { preHandler: [validar(criarProjetoSchema), verificarLimiteProjetos] }, async (request, reply) => {
    const { name, slug, description } = request.body as { name: string; slug: string; description?: string };
    const workspace = await obterWorkspaceDefault(request.user.id);

    const [existente] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.workspaceId, workspace.id), eq(projects.slug, slug)))
      .limit(1);

    if (existente) {
      return reply.status(409).send({
        error: { code: 'SLUG_EXISTS', message: `Projeto com slug '${slug}' já existe`, status: 409 },
      });
    }

    const [projeto] = await db.insert(projects).values({
      userId: request.user.id,
      workspaceId: workspace.id,
      name,
      slug,
      description,
    }).returning();

    return reply.status(201).send({ data: projeto });
  });

  app.get('/projects/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const projeto = await buscarProjeto(request.user.id, slug);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    return { data: projeto };
  });

  app.patch('/projects/:slug', { preHandler: [validar(atualizarProjetoSchema)] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const updates = request.body as Record<string, unknown>;
    const projeto = await buscarProjeto(request.user.id, slug);

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

  app.delete('/projects/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const projeto = await buscarProjeto(request.user.id, slug);

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

  app.get('/workspaces/:workspaceSlug/projects', async (request, reply) => {
    const { workspaceSlug } = request.params as { workspaceSlug: string };
    const resultado = await listarProjetosDoWorkspace(request.user.id, workspaceSlug);

    if (!resultado) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Workspace não encontrado', status: 404 },
      });
    }

    return { data: resultado.lista };
  });

  app.post(
    '/workspaces/:workspaceSlug/projects',
    { preHandler: [validar(criarProjetoSchema), verificarLimiteProjetos] },
    async (request, reply) => {
      const { workspaceSlug } = request.params as { workspaceSlug: string };
      const { name, slug, description } = request.body as { name: string; slug: string; description?: string };
      const workspace = await resolverWorkspaceId(request.user.id, workspaceSlug);

      if (!workspace) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Workspace não encontrado', status: 404 },
        });
      }

      const [existente] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, request.user.id), eq(projects.workspaceId, workspace.id), eq(projects.slug, slug)))
        .limit(1);

      if (existente) {
        return reply.status(409).send({
          error: { code: 'SLUG_EXISTS', message: `Projeto com slug '${slug}' já existe neste workspace`, status: 409 },
        });
      }

      const [projeto] = await db.insert(projects).values({
        userId: request.user.id,
        workspaceId: workspace.id,
        name,
        slug,
        description,
      }).returning();

      return reply.status(201).send({ data: projeto });
    },
  );

  app.get('/workspaces/:workspaceSlug/projects/:slug', async (request, reply) => {
    const { workspaceSlug, slug } = request.params as { workspaceSlug: string; slug: string };
    const projeto = await buscarProjeto(request.user.id, slug, workspaceSlug);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    return { data: projeto };
  });

  app.patch(
    '/workspaces/:workspaceSlug/projects/:slug',
    { preHandler: [validar(atualizarProjetoSchema)] },
    async (request, reply) => {
      const { workspaceSlug, slug } = request.params as { workspaceSlug: string; slug: string };
      const updates = request.body as Record<string, unknown>;
      const projeto = await buscarProjeto(request.user.id, slug, workspaceSlug);

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
    },
  );

  app.delete('/workspaces/:workspaceSlug/projects/:slug', async (request, reply) => {
    const { workspaceSlug, slug } = request.params as { workspaceSlug: string; slug: string };
    const projeto = await buscarProjeto(request.user.id, slug, workspaceSlug);

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

  async function listarPastasDoProjeto(userId: string, projectSlug: string, workspaceSlug?: string) {
    const projeto = await buscarProjeto(userId, projectSlug, workspaceSlug);
    if (!projeto) return null;

    const lista = await db.select().from(folders).where(eq(folders.projectId, projeto.id));
    return { projeto, lista };
  }

  app.get('/projects/:slug/folders', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const resultado = await listarPastasDoProjeto(request.user.id, slug);

    if (!resultado) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    return { data: resultado.lista };
  });

  app.post('/projects/:slug/folders', { preHandler: [validar(criarFolderSchema)] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { name, slug: folderSlug, sortOrder } = request.body as { name: string; slug: string; sortOrder: number };
    const projeto = await buscarProjeto(request.user.id, slug);

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

  app.delete('/projects/:slug/folders/:folderId', async (request, reply) => {
    const { slug, folderId } = request.params as { slug: string; folderId: string };
    const projeto = await buscarProjeto(request.user.id, slug);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.projectId, projeto.id)));
    return reply.status(204).send();
  });

  app.get('/workspaces/:workspaceSlug/projects/:slug/folders', async (request, reply) => {
    const { workspaceSlug, slug } = request.params as { workspaceSlug: string; slug: string };
    const resultado = await listarPastasDoProjeto(request.user.id, slug, workspaceSlug);

    if (!resultado) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    return { data: resultado.lista };
  });

  app.post(
    '/workspaces/:workspaceSlug/projects/:slug/folders',
    { preHandler: [validar(criarFolderSchema)] },
    async (request, reply) => {
      const { workspaceSlug, slug } = request.params as { workspaceSlug: string; slug: string };
      const { name, slug: folderSlug, sortOrder } = request.body as { name: string; slug: string; sortOrder: number };
      const projeto = await buscarProjeto(request.user.id, slug, workspaceSlug);

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
    },
  );

  app.delete('/workspaces/:workspaceSlug/projects/:slug/folders/:folderId', async (request, reply) => {
    const { workspaceSlug, slug, folderId } = request.params as { workspaceSlug: string; slug: string; folderId: string };
    const projeto = await buscarProjeto(request.user.id, slug, workspaceSlug);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.projectId, projeto.id)));
    return reply.status(204).send();
  });
}
