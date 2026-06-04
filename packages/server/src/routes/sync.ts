import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contentItems, contentTags, contentVersions, folders, projects, tags } from '../db/schema.js';
import { syncPullSchema, syncPushSchema } from '@myinst/shared';
import type { ContentType } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';

export async function syncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.post('/pull', { preHandler: [validar(syncPullSchema)] }, async (request, reply) => {
    const { project, types, tags: tagFilter, since } = request.body as {
      project: string; types?: string[]; tags?: string[]; since?: string;
    };

    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, project)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Projeto '${project}' não encontrado`, status: 404 },
      });
    }

    let items = await db
      .select()
      .from(contentItems)
      .where(and(
        eq(contentItems.projectId, projeto.id),
        eq(contentItems.isActive, true),
        ...(since ? [gte(contentItems.updatedAt, new Date(since))] : []),
      ));

    if (types && types.length > 0) {
      items = items.filter((item) => types.includes(item.type));
    }

    if (tagFilter && tagFilter.length > 0) {
      const tagsDoUsuario = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(and(eq(tags.userId, request.user.id), inArray(tags.name, tagFilter)));

      const tagIds = tagsDoUsuario.map((t) => t.id);

      if (tagIds.length > 0) {
        const conteudosComTag = await db
          .select({ contentId: contentTags.contentId })
          .from(contentTags)
          .where(inArray(contentTags.tagId, tagIds));

        const idsSet = new Set(conteudosComTag.map((r) => r.contentId));
        items = items.filter((item) => idsSet.has(item.id));
      } else {
        items = [];
      }
    }

    const comTags = await Promise.all(
      items.map(async (item) => {
        const itemTags = await db
          .select({ name: tags.name })
          .from(contentTags)
          .innerJoin(tags, eq(tags.id, contentTags.tagId))
          .where(eq(contentTags.contentId, item.id));

        return { ...item, tags: itemTags.map((t) => t.name) };
      }),
    );

    const syncToken = Buffer.from(new Date().toISOString()).toString('base64url');

    return {
      data: {
        items: comTags,
        syncToken,
        serverTime: new Date().toISOString(),
      },
    };
  });

  app.post('/push', { preHandler: [validar(syncPushSchema)] }, async (request, reply) => {
    const { project, items, folderSlug } = request.body as {
      project: string;
      folderSlug?: string;
      items: { type: ContentType; title: string; slug: string; body: string; metadata: Record<string, unknown>; tags: string[] }[];
    };

    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, project)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Projeto '${project}' não encontrado`, status: 404 },
      });
    }

    let folderId: string | null = null;
    if (folderSlug) {
      const [pasta] = await db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.projectId, projeto.id), eq(folders.slug, folderSlug)))
        .limit(1);

      if (pasta) {
        folderId = pasta.id;
      }
    }

    const criados: string[] = [];
    const atualizados: string[] = [];

    for (const item of items) {
      const [existente] = await db
        .select()
        .from(contentItems)
        .where(and(
          eq(contentItems.projectId, projeto.id),
          eq(contentItems.type, item.type),
          eq(contentItems.slug, item.slug),
        ))
        .limit(1);

      if (existente) {
        await db.insert(contentVersions).values({
          contentId: existente.id,
          version: existente.version,
          body: existente.body,
          metadata: existente.metadata,
        });

        await db
          .update(contentItems)
          .set({
            title: item.title,
            body: item.body,
            metadata: item.metadata,
            version: existente.version + 1,
            updatedAt: new Date(),
            ...(folderId ? { folderId } : {}),
          })
          .where(eq(contentItems.id, existente.id));

        await vincularTags(request.user.id, existente.id, item.tags);
        atualizados.push(item.slug);
      } else {
        const [novo] = await db
          .insert(contentItems)
          .values({
            userId: request.user.id,
            projectId: projeto.id,
            folderId,
            type: item.type,
            title: item.title,
            slug: item.slug,
            body: item.body,
            metadata: item.metadata,
          })
          .returning({ id: contentItems.id });

        await vincularTags(request.user.id, novo.id, item.tags);
        criados.push(item.slug);
      }
    }

    return {
      data: {
        created: criados,
        updated: atualizados,
        serverTime: new Date().toISOString(),
      },
    };
  });

  app.get('/status', async (request, reply) => {
    const { project, since } = request.query as { project?: string; since?: string };

    if (!project) {
      return reply.status(400).send({
        error: { code: 'MISSING_PROJECT', message: 'Parâmetro project é obrigatório', status: 400 },
      });
    }

    const [projeto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, request.user.id), eq(projects.slug, project)))
      .limit(1);

    if (!projeto) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: `Projeto '${project}' não encontrado`, status: 404 },
      });
    }

    const sinceDate = since ? new Date(since) : new Date(0);

    const alterados = await db
      .select({ id: contentItems.id, slug: contentItems.slug, type: contentItems.type, updatedAt: contentItems.updatedAt })
      .from(contentItems)
      .where(and(
        eq(contentItems.projectId, projeto.id),
        gte(contentItems.updatedAt, sinceDate),
      ));

    return {
      data: {
        changedCount: alterados.length,
        items: alterados,
        serverTime: new Date().toISOString(),
      },
    };
  });
}

async function vincularTags(userId: string, contentId: string, tagNames: string[]) {
  await db.delete(contentTags).where(eq(contentTags.contentId, contentId));

  if (tagNames.length === 0) return;

  const tagsExistentes = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, tagNames)));

  const nomesExistentes = new Set(tagsExistentes.map((t) => t.name));
  const tagsFaltantes = tagNames.filter((n) => !nomesExistentes.has(n));

  const tagsCriadas = tagsFaltantes.length > 0
    ? await db
        .insert(tags)
        .values(tagsFaltantes.map((name) => ({ userId, name, category: 'custom' as const })))
        .returning({ id: tags.id, name: tags.name })
    : [];

  const todasTags = [...tagsExistentes, ...tagsCriadas];

  await db.insert(contentTags).values(
    todasTags.map((t) => ({ contentId, tagId: t.id })),
  );
}
