import type { FastifyInstance } from 'fastify';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { diffLines } from 'diff';
import { db } from '../db/index.js';
import { contentItems, contentTags, contentVersions, projects, tags } from '../db/schema.js';
import { criarConteudoSchema, atualizarConteudoSchema } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { validar } from '../middleware/validation.js';
import { verificarLimiteConteudo } from '../middleware/usage.js';
import { obterWorkspaceDefault, resolverWorkspaceDoUsuario } from '../lib/workspaces.js';

export async function contentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  async function buscarProjeto(userId: string, projectSlug: string, workspaceSlug?: string) {
    const workspace = workspaceSlug
      ? await resolverWorkspaceDoUsuario(userId, workspaceSlug)
      : await obterWorkspaceDefault(userId);

    if (!workspace) return null;

    const [projeto] = await db
      .select({ id: projects.id, workspaceId: projects.workspaceId })
      .from(projects)
      .where(and(
        eq(projects.userId, userId),
        eq(projects.workspaceId, workspace.id),
        eq(projects.slug, projectSlug),
      ))
      .limit(1);

    return projeto ? { workspace, projeto } : null;
  }

  async function vincularTags(contentId: string, userId: string, workspaceId: string, tagNames: string[]) {
    await db.delete(contentTags).where(eq(contentTags.contentId, contentId));
    if (tagNames.length === 0) return;

    const tagsExistentes = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(eq(tags.userId, userId), eq(tags.workspaceId, workspaceId), inArray(tags.name, tagNames)));

    const nomesExistentes = new Set(tagsExistentes.map((tag) => tag.name));
    const tagsFaltantes = tagNames.filter((name) => !nomesExistentes.has(name));

    const tagsCriadas = tagsFaltantes.length > 0
      ? await db
          .insert(tags)
          .values(tagsFaltantes.map((name) => ({
            userId,
            workspaceId,
            name,
            category: 'custom' as const,
          })))
          .returning({ id: tags.id, name: tags.name })
      : [];

    const todasTags = [...tagsExistentes, ...tagsCriadas];
    if (todasTags.length === 0) return;

    await db.insert(contentTags).values(
      todasTags.map((tag) => ({ contentId, tagId: tag.id })),
    );
  }

  async function buscarTagsDoConteudo(contentId: string) {
    const resultado = await db
      .select({ name: tags.name })
      .from(contentTags)
      .innerJoin(tags, eq(tags.id, contentTags.tagId))
      .where(eq(contentTags.contentId, contentId));

    return resultado.map((item) => item.name);
  }

  async function listarConteudos(
    userId: string,
    projectSlug: string,
    workspaceSlug: string | undefined,
    filtros: { type?: string; tag?: string; active?: string },
  ) {
    const contexto = await buscarProjeto(userId, projectSlug, workspaceSlug);
    if (!contexto) return null;

    let query = db
      .select()
      .from(contentItems)
      .where(eq(contentItems.projectId, contexto.projeto.id))
      .$dynamic();

    if (filtros.type) {
      query = query.where(eq(contentItems.type, filtros.type as any));
    }
    if (filtros.active !== undefined) {
      query = query.where(eq(contentItems.isActive, filtros.active === 'true'));
    }

    const items = await query;

    let resultado = items;
    if (filtros.tag) {
      const idsComTag = await db
        .select({ contentId: contentTags.contentId })
        .from(contentTags)
        .innerJoin(tags, eq(tags.id, contentTags.tagId))
        .where(and(eq(tags.workspaceId, contexto.workspace.id), eq(tags.name, filtros.tag)));

      const idsSet = new Set(idsComTag.map((item) => item.contentId));
      resultado = items.filter((item) => idsSet.has(item.id));
    }

    const comTags = await Promise.all(
      resultado.map(async (item) => ({
        ...item,
        tags: await buscarTagsDoConteudo(item.id),
      })),
    );

    return { contexto, items: comTags };
  }

  async function criarConteudo(
    userId: string,
    projectSlug: string,
    workspaceSlug: string | undefined,
    body: {
      type: string;
      title: string;
      slug: string;
      description?: string;
      body: string;
      folderId?: string;
      metadata: Record<string, unknown>;
      tags: string[];
      isActive: boolean;
    },
  ) {
    const contexto = await buscarProjeto(userId, projectSlug, workspaceSlug);
    if (!contexto) return null;

    const [existente] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(
        eq(contentItems.projectId, contexto.projeto.id),
        eq(contentItems.type, body.type as any),
        eq(contentItems.slug, body.slug),
      ))
      .limit(1);

    if (existente) {
      return { contexto, existente: true as const };
    }

    const [item] = await db.insert(contentItems).values({
      userId,
      projectId: contexto.projeto.id,
      folderId: body.folderId || null,
      type: body.type as any,
      title: body.title,
      slug: body.slug,
      description: body.description,
      body: body.body,
      metadata: body.metadata,
      isActive: body.isActive,
    }).returning();

    await vincularTags(item.id, userId, contexto.workspace.id, body.tags);

    return {
      contexto,
      existente: false as const,
      item: { ...item, tags: body.tags },
    };
  }

  async function buscarConteudoPorSlug(userId: string, projectSlug: string, contentSlug: string, workspaceSlug?: string) {
    const contexto = await buscarProjeto(userId, projectSlug, workspaceSlug);
    if (!contexto) return null;

    const [item] = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.projectId, contexto.projeto.id), eq(contentItems.slug, contentSlug)))
      .limit(1);

    return item ? { contexto, item } : null;
  }

  async function registrarLista(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.get(path, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const { type, tag, active } = request.query as { type?: string; tag?: string; active?: string };
      const resultado = await listarConteudos(
        request.user.id,
        projectSlugFromParams(params),
        workspaceSlugFromParams(params),
        { type, tag, active },
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
        });
      }

      return { data: resultado.items, meta: { total: resultado.items.length, page: 1, perPage: 100 } };
    });
  }

  async function registrarCriacao(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.post(path, { preHandler: [validar(criarConteudoSchema), verificarLimiteConteudo] }, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const body = request.body as {
        type: string;
        title: string;
        slug: string;
        description?: string;
        body: string;
        folderId?: string;
        metadata: Record<string, unknown>;
        tags: string[];
        isActive: boolean;
      };

      const resultado = await criarConteudo(
        request.user.id,
        projectSlugFromParams(params),
        workspaceSlugFromParams(params),
        body,
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Projeto não encontrado', status: 404 },
        });
      }

      if (resultado.existente) {
        return reply.status(409).send({
          error: {
            code: 'SLUG_EXISTS',
            message: `Conteúdo '${body.slug}' já existe neste projeto`,
            status: 409,
          },
        });
      }

      return reply.status(201).send({ data: resultado.item });
    });
  }

  async function registrarObter(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.get(path, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const resultado = await buscarConteudoPorSlug(
        request.user.id,
        projectSlugFromParams(params),
        params.contentSlug,
        workspaceSlugFromParams(params),
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
        });
      }

      const itemTags = await buscarTagsDoConteudo(resultado.item.id);
      return { data: { ...resultado.item, tags: itemTags } };
    });
  }

  async function registrarAtualizacao(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.patch(path, { preHandler: [validar(atualizarConteudoSchema)] }, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const updates = request.body as Record<string, unknown>;
      const resultado = await buscarConteudoPorSlug(
        request.user.id,
        projectSlugFromParams(params),
        params.contentSlug,
        workspaceSlugFromParams(params),
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
        });
      }

      await db.insert(contentVersions).values({
        contentId: resultado.item.id,
        version: resultado.item.version,
        body: resultado.item.body,
        metadata: resultado.item.metadata,
      });

      const { tags: newTags, ...fieldsToUpdate } = updates;
      const [atualizado] = await db
        .update(contentItems)
        .set({ ...fieldsToUpdate, version: resultado.item.version + 1, updatedAt: new Date() })
        .where(eq(contentItems.id, resultado.item.id))
        .returning();

      if (Array.isArray(newTags)) {
        await vincularTags(resultado.item.id, request.user.id, resultado.contexto.workspace.id, newTags as string[]);
      }

      const itemTags = await buscarTagsDoConteudo(resultado.item.id);
      return { data: { ...atualizado, tags: itemTags } };
    });
  }

  async function registrarDelete(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.delete(path, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const resultado = await buscarConteudoPorSlug(
        request.user.id,
        projectSlugFromParams(params),
        params.contentSlug,
        workspaceSlugFromParams(params),
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
        });
      }

      await db.delete(contentItems).where(eq(contentItems.id, resultado.item.id));
      return reply.status(204).send();
    });
  }

  async function registrarVersoes(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.get(path, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const resultado = await buscarConteudoPorSlug(
        request.user.id,
        projectSlugFromParams(params),
        params.contentSlug,
        workspaceSlugFromParams(params),
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
        });
      }

      const versoes = await db
        .select()
        .from(contentVersions)
        .where(eq(contentVersions.contentId, resultado.item.id));

      return { data: versoes };
    });
  }

  async function registrarDiff(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.get(path, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const { v1, v2 } = request.query as { v1?: string; v2?: string };

      if (!v1) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Parâmetro v1 é obrigatório', status: 400 },
        });
      }

      const resultado = await buscarConteudoPorSlug(
        request.user.id,
        projectSlugFromParams(params),
        params.contentSlug,
        workspaceSlugFromParams(params),
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
        });
      }

      const versaoNumV1 = Number(v1);
      const versaoNumV2 = v2 ? Number(v2) : resultado.item.version;

      let bodyV1: string;
      if (versaoNumV1 === resultado.item.version) {
        bodyV1 = resultado.item.body;
      } else {
        const [versao1] = await db
          .select({ body: contentVersions.body })
          .from(contentVersions)
          .where(and(eq(contentVersions.contentId, resultado.item.id), eq(contentVersions.version, versaoNumV1)))
          .limit(1);

        if (!versao1) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `Versão ${versaoNumV1} não encontrada`, status: 404 },
          });
        }
        bodyV1 = versao1.body;
      }

      let bodyV2: string;
      if (versaoNumV2 === resultado.item.version) {
        bodyV2 = resultado.item.body;
      } else {
        const [versao2] = await db
          .select({ body: contentVersions.body })
          .from(contentVersions)
          .where(and(eq(contentVersions.contentId, resultado.item.id), eq(contentVersions.version, versaoNumV2)))
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
  }

  async function registrarRestore(
    path: string,
    workspaceSlugFromParams: (params: Record<string, string>) => string | undefined,
    projectSlugFromParams: (params: Record<string, string>) => string,
  ) {
    app.post(path, async (request, reply) => {
      const params = request.params as Record<string, string>;
      const { version } = request.body as { version?: number };

      if (!version) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Parâmetro version é obrigatório', status: 400 },
        });
      }

      const resultado = await buscarConteudoPorSlug(
        request.user.id,
        projectSlugFromParams(params),
        params.contentSlug,
        workspaceSlugFromParams(params),
      );

      if (!resultado) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Conteúdo não encontrado', status: 404 },
        });
      }

      const [versaoAlvo] = await db
        .select({ body: contentVersions.body, metadata: contentVersions.metadata })
        .from(contentVersions)
        .where(and(eq(contentVersions.contentId, resultado.item.id), eq(contentVersions.version, version)))
        .limit(1);

      if (!versaoAlvo) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Versão ${version} não encontrada`, status: 404 },
        });
      }

      await db.insert(contentVersions).values({
        contentId: resultado.item.id,
        version: resultado.item.version,
        body: resultado.item.body,
        metadata: resultado.item.metadata,
      });

      const [atualizado] = await db
        .update(contentItems)
        .set({
          body: versaoAlvo.body,
          metadata: versaoAlvo.metadata,
          version: resultado.item.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, resultado.item.id))
        .returning();

      const itemTags = await buscarTagsDoConteudo(resultado.item.id);
      return { data: { ...atualizado, tags: itemTags } };
    });
  }

  const legadoWorkspace = (_params: Record<string, string>) => undefined;
  const legadoProjeto = (params: Record<string, string>) => params.slug;
  const workspaceExpl = (params: Record<string, string>) => params.workspaceSlug;
  const workspaceProjeto = (params: Record<string, string>) => params.projectSlug;

  await registrarLista('/projects/:slug/content', legadoWorkspace, legadoProjeto);
  await registrarCriacao('/projects/:slug/content', legadoWorkspace, legadoProjeto);
  await registrarObter('/projects/:slug/content/:contentSlug', legadoWorkspace, legadoProjeto);
  await registrarAtualizacao('/projects/:slug/content/:contentSlug', legadoWorkspace, legadoProjeto);
  await registrarDelete('/projects/:slug/content/:contentSlug', legadoWorkspace, legadoProjeto);
  await registrarVersoes('/projects/:slug/content/:contentSlug/versions', legadoWorkspace, legadoProjeto);
  await registrarDiff('/projects/:slug/content/:contentSlug/diff', legadoWorkspace, legadoProjeto);
  await registrarRestore('/projects/:slug/content/:contentSlug/restore', legadoWorkspace, legadoProjeto);

  await registrarLista('/workspaces/:workspaceSlug/projects/:projectSlug/content', workspaceExpl, workspaceProjeto);
  await registrarCriacao('/workspaces/:workspaceSlug/projects/:projectSlug/content', workspaceExpl, workspaceProjeto);
  await registrarObter('/workspaces/:workspaceSlug/projects/:projectSlug/content/:contentSlug', workspaceExpl, workspaceProjeto);
  await registrarAtualizacao('/workspaces/:workspaceSlug/projects/:projectSlug/content/:contentSlug', workspaceExpl, workspaceProjeto);
  await registrarDelete('/workspaces/:workspaceSlug/projects/:projectSlug/content/:contentSlug', workspaceExpl, workspaceProjeto);
  await registrarVersoes('/workspaces/:workspaceSlug/projects/:projectSlug/content/:contentSlug/versions', workspaceExpl, workspaceProjeto);
  await registrarDiff('/workspaces/:workspaceSlug/projects/:projectSlug/content/:contentSlug/diff', workspaceExpl, workspaceProjeto);
  await registrarRestore('/workspaces/:workspaceSlug/projects/:projectSlug/content/:contentSlug/restore', workspaceExpl, workspaceProjeto);
}
