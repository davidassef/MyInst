import type { FastifyInstance } from 'fastify';
import { and, eq, gte } from 'drizzle-orm';
import type { ClientProfileId } from '@myinst/shared';
import { clientProfileIdSchema, criarClientProfileItemSchema, atualizarClientProfileItemSchema } from '@myinst/shared';
import { db } from '../db/index.js';
import { clientProfileItems, clientProfileItemVersions } from '../db/schema.js';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { buscarClientProfile, listarClientProfilesDoUsuario, obterOuCriarClientProfile } from '../lib/client-profiles.js';

const CAMPO_TAGS_METADATA = 'myinstTags';

export async function clientProfileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/client-profiles', async (request) => {
    const perfis = await listarClientProfilesDoUsuario(request.user.id);
    return { data: perfis };
  });

  app.get('/client-profiles/:clientId', async (request, reply) => {
    const { clientId } = request.params as { clientId: ClientProfileId };
    const clientIdValidado = clientProfileIdSchema.parse(clientId);
    const perfil = await buscarClientProfile(request.user.id, clientIdValidado);

    if (!perfil) {
      return { data: await obterOuCriarClientProfile(request.user.id, clientIdValidado) };
    }

    return { data: perfil };
  });

  app.get('/client-profiles/:clientId/items', async (request, reply) => {
    const { clientId } = request.params as { clientId: ClientProfileId };
    const { type, active } = request.query as { type?: string; active?: string };
    const perfil = await obterOuCriarClientProfile(request.user.id, clientProfileIdSchema.parse(clientId));

    let query = db
      .select()
      .from(clientProfileItems)
      .where(eq(clientProfileItems.clientProfileId, perfil.id))
      .$dynamic();

    if (type) {
      query = query.where(eq(clientProfileItems.type, type as any));
    }

    if (active !== undefined) {
      query = query.where(eq(clientProfileItems.isActive, active === 'true'));
    }

    const itens = await query;
    return {
      data: itens.map(normalizarItemClientProfile),
      meta: { total: itens.length, page: 1, perPage: 100 },
    };
  });

  app.post(
    '/client-profiles/:clientId/items',
    { preHandler: [validar(criarClientProfileItemSchema)] },
    async (request, reply) => {
      const { clientId } = request.params as { clientId: ClientProfileId };
      const body = request.body as {
        type: string;
        title: string;
        slug: string;
        description?: string;
        body: string;
        metadata: Record<string, unknown>;
        tags: string[];
        isActive: boolean;
      };

      const perfil = await obterOuCriarClientProfile(request.user.id, clientProfileIdSchema.parse(clientId));
      const [existente] = await db
        .select({ id: clientProfileItems.id })
        .from(clientProfileItems)
        .where(and(
          eq(clientProfileItems.clientProfileId, perfil.id),
          eq(clientProfileItems.type, body.type as any),
          eq(clientProfileItems.slug, body.slug),
        ))
        .limit(1);

      if (existente) {
        return reply.status(409).send({
          error: { code: 'SLUG_EXISTS', message: `Item global com slug '${body.slug}' já existe`, status: 409 },
        });
      }

      const [item] = await db
        .insert(clientProfileItems)
        .values({
          userId: request.user.id,
          clientProfileId: perfil.id,
          type: body.type as any,
          title: body.title,
          slug: body.slug,
          description: body.description,
          body: body.body,
          metadata: anexarTagsAoMetadata(body.metadata, body.tags),
          isActive: body.isActive,
        })
        .returning();

      return reply.status(201).send({ data: normalizarItemClientProfile(item) });
    },
  );

  app.patch(
    '/client-profiles/:clientId/items/:itemSlug',
    { preHandler: [validar(atualizarClientProfileItemSchema)] },
    async (request, reply) => {
      const { clientId, itemSlug } = request.params as { clientId: ClientProfileId; itemSlug: string };
      const body = request.body as {
        type?: string;
        title?: string;
        slug?: string;
        description?: string;
        body?: string;
        metadata?: Record<string, unknown>;
        tags?: string[];
        isActive?: boolean;
      };

      const perfil = await obterOuCriarClientProfile(request.user.id, clientProfileIdSchema.parse(clientId));
      const [existente] = await db
        .select()
        .from(clientProfileItems)
        .where(and(eq(clientProfileItems.clientProfileId, perfil.id), eq(clientProfileItems.slug, itemSlug)))
        .limit(1);

      if (!existente) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Item global não encontrado', status: 404 },
        });
      }

      if (body.slug && body.slug !== existente.slug) {
        const [colisao] = await db
          .select({ id: clientProfileItems.id })
          .from(clientProfileItems)
          .where(and(
            eq(clientProfileItems.clientProfileId, perfil.id),
            eq(clientProfileItems.type, (body.type || existente.type) as any),
            eq(clientProfileItems.slug, body.slug),
          ))
          .limit(1);

        if (colisao) {
          return reply.status(409).send({
            error: { code: 'SLUG_EXISTS', message: `Item global com slug '${body.slug}' já existe`, status: 409 },
          });
        }
      }

      await db.insert(clientProfileItemVersions).values({
        clientProfileItemId: existente.id,
        version: existente.version,
        body: existente.body,
        metadata: existente.metadata,
      });

      const [atualizado] = await db
        .update(clientProfileItems)
        .set({
          ...(body.type !== undefined ? { type: body.type as any } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.slug !== undefined ? { slug: body.slug } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.body !== undefined ? { body: body.body } : {}),
          ...(body.metadata !== undefined || body.tags !== undefined
            ? {
                metadata: anexarTagsAoMetadata(
                  body.metadata ?? (existente.metadata as Record<string, unknown>),
                  body.tags ?? lerTagsDoMetadata(existente.metadata as Record<string, unknown>),
                ),
              }
            : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          version: existente.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(clientProfileItems.id, existente.id))
        .returning();

      return { data: normalizarItemClientProfile(atualizado) };
    },
  );

  app.delete('/client-profiles/:clientId/items/:itemSlug', async (request, reply) => {
    const { clientId, itemSlug } = request.params as { clientId: ClientProfileId; itemSlug: string };
    const perfil = await obterOuCriarClientProfile(request.user.id, clientProfileIdSchema.parse(clientId));

    const [existente] = await db
      .select({ id: clientProfileItems.id })
      .from(clientProfileItems)
      .where(and(eq(clientProfileItems.clientProfileId, perfil.id), eq(clientProfileItems.slug, itemSlug)))
      .limit(1);

    if (!existente) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Item global não encontrado', status: 404 },
      });
    }

    await db.delete(clientProfileItems).where(eq(clientProfileItems.id, existente.id));
    return reply.status(204).send();
  });

  app.get('/client-profiles/:clientId/status', async (request, reply) => {
    const { clientId } = request.params as { clientId: ClientProfileId };
    const { since } = request.query as { since?: string };
    const perfil = await obterOuCriarClientProfile(request.user.id, clientProfileIdSchema.parse(clientId));
    const sinceDate = since ? new Date(since) : new Date(0);

    const alterados = await db
      .select({ id: clientProfileItems.id, slug: clientProfileItems.slug, type: clientProfileItems.type, updatedAt: clientProfileItems.updatedAt })
      .from(clientProfileItems)
      .where(and(
        eq(clientProfileItems.clientProfileId, perfil.id),
        gte(clientProfileItems.updatedAt, sinceDate),
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

function anexarTagsAoMetadata(metadata: Record<string, unknown>, tags: string[]) {
  return {
    ...metadata,
    [CAMPO_TAGS_METADATA]: tags,
  };
}

function lerTagsDoMetadata(metadata: Record<string, unknown>) {
  const tags = metadata[CAMPO_TAGS_METADATA];
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
}

function normalizarItemClientProfile(item: typeof clientProfileItems.$inferSelect) {
  const metadata = item.metadata as Record<string, unknown>;
  return {
    ...item,
    metadata,
    tags: lerTagsDoMetadata(metadata),
  };
}
