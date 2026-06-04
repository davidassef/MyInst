import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, gte } from 'drizzle-orm';
import { diffLines } from 'diff';
import { db } from '../db/index.js';
import { contentItems, contentTags, contentVersions, projects, tags } from '../db/schema.js';
import { criarConteudoSchema, atualizarConteudoSchema } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { verificarLimiteConteudo } from '../middleware/usage.js';

export async function contentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  async function buscarProjeto(userId: string, slug: string) {
    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
      .limit(1);
    return projeto;
  }

  async function vincularTags(contentId: string, userId: string, tagNames: string[]) {
    if (tagNames.length === 0) return;

    const tagsExistentes = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.name, tagNames)));

    const valores = tagsExistentes.map((t) => ({ contentId, tagId: t.id }));
    if (valores.length > 0) {
      await db.insert(contentTags).values(valores);
    }
  }

  async function buscarTagsDoConteudo(contentId: string) {
    const resultado = await db
      .select({ name: tags.name })
      .from(contentTags)
      .innerJoin(tags, eq(tags.id, contentTags.tagId))
      .where(eq(contentTags.contentId, contentId));
    return resultado.map((r) => r.name);
  }

  app.get('/:slug/content', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { type, folder, tag, active } = request.query as {
      type?: string; folder?: string; tag?: string; active?: string;
    };

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    let query = db
      .select()
      .from(contentItems)
      .where(eq(contentItems.projectId, projeto.id))
      .$dynamic();

    if (type) {
      query = query.where(eq(contentItems.type, type as any));
    }
    if (active !== undefined) {
      query = query.where(eq(contentItems.isActive, active === 'true'));
    }

    const items = await query;

    let resultado = items;
    if (tag) {
      const idsComTag = await db
        .select({ contentId: contentTags.contentId })
        .from(contentTags)
        .innerJoin(tags, eq(tags.id, contentTags.tagId))
        .where(eq(tags.name, tag));

      const idsSet = new Set(idsComTag.map((r) => r.contentId));
      resultado = items.filter((item) => idsSet.has(item.id));
    }

    const comTags = await Promise.all(
      resultado.map(async (item) => ({
        ...item,
        tags: await buscarTagsDoConteudo(item.id),
      })),
    );

    return { data: comTags, meta: { total: comTags.length, page: 1, perPage: 100 } };
  });

  app.post('/:slug/content', { preHandler: [validar(criarConteudoSchema), verificarLimiteConteudo] }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = request.body as {
      type: string; title: string; slug: string; description?: string;
      body: string; folderId?: string; metadata: Record<string, unknown>;
      tags: string[]; isActive: boolean;
    };

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [existente] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(
        eq(contentItems.projectId, projeto.id),
        eq(contentItems.type, body.type as any),
        eq(contentItems.slug, body.slug),
      ))
      .limit(1);

    if (existente) {
      return reply.status(409).send({
        error: { code: 'SLUG_EXISTS', message: `Conteúdo '${body.slug}' já existe neste projeto`, status: 409 },
      });
    }

    const [item] = await db.insert(contentItems).values({
      userId: request.user.id,
      projectId: projeto.id,
      folderId: body.folderId || null,
      type: body.type as any,
      title: body.title,
      slug: body.slug,
      description: body.description,
      body: body.body,
      metadata: body.metadata,
      isActive: body.isActive,
    }).returning();

    await vincularTags(item.id, request.user.id, body.tags);

    return reply.status(201).send({
      data: { ...item, tags: body.tags },
    });
  });

  app.get('/:slug/content/:contentSlug', async (request, reply) => {
    const { slug, contentSlug } = request.params as { slug: string; contentSlug: string };

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [item] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.projectId, projeto.id), eq(contentItems.slug, contentSlug)))
      .limit(1);

    if (!item) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
      });
    }

    const itemTags = await buscarTagsDoConteudo(item.id);
    return { data: { ...item, tags: itemTags } };
  });

  app.patch('/:slug/content/:contentSlug', { preHandler: [validar(atualizarConteudoSchema)] }, async (request, reply) => {
    const { slug, contentSlug } = request.params as { slug: string; contentSlug: string };
    const updates = request.body as Record<string, unknown>;

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [item] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.projectId, projeto.id), eq(contentItems.slug, contentSlug)))
      .limit(1);

    if (!item) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
      });
    }

    // Salvar versão anterior
    await db.insert(contentVersions).values({
      contentId: item.id,
      version: item.version,
      body: item.body,
      metadata: item.metadata,
    });

    const { tags: newTags, ...fieldsToUpdate } = updates;
    const [atualizado] = await db
      .update(contentItems)
      .set({ ...fieldsToUpdate, version: item.version + 1, updatedAt: new Date() })
      .where(eq(contentItems.id, item.id))
      .returning();

    if (Array.isArray(newTags)) {
      await db.delete(contentTags).where(eq(contentTags.contentId, item.id));
      await vincularTags(item.id, request.user.id, newTags as string[]);
    }

    const itemTags = await buscarTagsDoConteudo(item.id);
    return { data: { ...atualizado, tags: itemTags } };
  });

  app.delete('/:slug/content/:contentSlug', async (request, reply) => {
    const { slug, contentSlug } = request.params as { slug: string; contentSlug: string };

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [deleted] = await db
      .delete(contentItems)
      .where(and(eq(contentItems.projectId, projeto.id), eq(contentItems.slug, contentSlug)))
      .returning({ id: contentItems.id });

    if (!deleted) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
      });
    }

    return reply.status(204).send();
  });

  app.get('/:slug/content/:contentSlug/versions', async (request, reply) => {
    const { slug, contentSlug } = request.params as { slug: string; contentSlug: string };

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [item] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.projectId, projeto.id), eq(contentItems.slug, contentSlug)))
      .limit(1);

    if (!item) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
      });
    }

    const versoes = await db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.contentId, item.id));

    return { data: versoes };
  });

  app.get('/:slug/content/:contentSlug/diff', async (request, reply) => {
    const { slug, contentSlug } = request.params as { slug: string; contentSlug: string };
    const { v1, v2 } = request.query as { v1?: string; v2?: string };

    if (!v1) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Parâmetro v1 é obrigatório', status: 400 },
      });
    }

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [item] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.projectId, projeto.id), eq(contentItems.slug, contentSlug)))
      .limit(1);

    if (!item) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
      });
    }

    const versaoNumV1 = Number(v1);
    const versaoNumV2 = v2 ? Number(v2) : item.version;

    let bodyV1: string;
    if (versaoNumV1 === item.version) {
      bodyV1 = item.body;
    } else {
      const [versao1] = await db
        .select({ body: contentVersions.body })
        .from(contentVersions)
        .where(and(eq(contentVersions.contentId, item.id), eq(contentVersions.version, versaoNumV1)))
        .limit(1);

      if (!versao1) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Versão ${versaoNumV1} não encontrada`, status: 404 },
        });
      }
      bodyV1 = versao1.body;
    }

    let bodyV2: string;
    if (versaoNumV2 === item.version) {
      bodyV2 = item.body;
    } else {
      const [versao2] = await db
        .select({ body: contentVersions.body })
        .from(contentVersions)
        .where(and(eq(contentVersions.contentId, item.id), eq(contentVersions.version, versaoNumV2)))
        .limit(1);

      if (!versao2) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Versão ${versaoNumV2} não encontrada`, status: 404 },
        });
      }
      bodyV2 = versao2.body;
    }

    const alteracoes = diffLines(bodyV1, bodyV2).map((parte) => ({
      type: parte.added ? 'added' : parte.removed ? 'removed' : 'unchanged',
      value: parte.value,
    }));

    return { data: { v1: versaoNumV1, v2: versaoNumV2, changes: alteracoes } };
  });

  app.post('/:slug/content/:contentSlug/restore', async (request, reply) => {
    const { slug, contentSlug } = request.params as { slug: string; contentSlug: string };
    const { version } = request.body as { version?: number };

    if (!version) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Parâmetro version é obrigatório', status: 400 },
      });
    }

    const projeto = await buscarProjeto(request.user.id, slug);
    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
      });
    }

    const [item] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.projectId, projeto.id), eq(contentItems.slug, contentSlug)))
      .limit(1);

    if (!item) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
      });
    }

    const [versaoAlvo] = await db
      .select({ body: contentVersions.body, metadata: contentVersions.metadata })
      .from(contentVersions)
      .where(and(eq(contentVersions.contentId, item.id), eq(contentVersions.version, version)))
      .limit(1);

    if (!versaoAlvo) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Versão ${version} não encontrada`, status: 404 },
      });
    }

    await db.insert(contentVersions).values({
      contentId: item.id,
      version: item.version,
      body: item.body,
      metadata: item.metadata,
    });

    const [atualizado] = await db
      .update(contentItems)
      .set({
        body: versaoAlvo.body,
        metadata: versaoAlvo.metadata,
        version: item.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, item.id))
      .returning();

    const itemTags = await buscarTagsDoConteudo(item.id);
    return { data: { ...atualizado, tags: itemTags } };
  });
}
