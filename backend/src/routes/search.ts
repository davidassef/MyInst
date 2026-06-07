import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { ClientProfileId, SearchScope } from '@myinst/shared';
import { autenticar } from '../middleware/auth.js';
import { obterWorkspaceDefault, resolverWorkspaceDoUsuario } from '../lib/workspaces.js';

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/search', async (request, reply) => {
    const { q, project, type, scope, clientId } = request.query as {
      q?: string;
      workspace?: string;
      project?: string;
      type?: string;
      scope?: SearchScope;
      clientId?: ClientProfileId;
    };

    if (!q || q.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Parâmetro "q" é obrigatório', status: 400 },
      });
    }

    const userId = request.user.id;
    const termo = q.trim();
    const workspace = q
      ? (request.query as { workspace?: string }).workspace
        ? await resolverWorkspaceDoUsuario(userId, (request.query as { workspace?: string }).workspace)
        : await obterWorkspaceDefault(userId)
      : null;

    const resultadosProjeto = (scope === 'global')
      ? []
      : await buscarResultadosProjeto({
          userId,
          workspaceId: workspace?.id,
          project,
          type,
          termo,
        });

    const resultadosGlobais = (scope === 'project')
      ? []
      : await buscarResultadosGlobais({
          userId,
          clientId,
          type,
          termo,
        });

    const resultados = [...resultadosProjeto, ...resultadosGlobais]
      .sort((a, b) => Number(b.rank) - Number(a.rank))
      .slice(0, 50);

    return {
      data: resultados,
      meta: { total: resultados.length, query: termo },
    };
  });
}

async function buscarResultadosProjeto({
  userId,
  workspaceId,
  project,
  type,
  termo,
}: {
  userId: string;
  workspaceId?: string;
  project?: string;
  type?: string;
  termo: string;
}) {
  if (!workspaceId) {
    return [];
  }

  const condicoes = [
    sql`ci.user_id = ${userId}`,
    sql`p.workspace_id = ${workspaceId}`,
    sql`to_tsvector('portuguese', coalesce(ci.title, '') || ' ' || coalesce(ci.body, '') || ' ' || coalesce(ci.description, '')) @@ plainto_tsquery('portuguese', ${termo})`,
  ];

  if (project) {
    condicoes.push(sql`p.slug = ${project}`);
  }

  if (type) {
    condicoes.push(sql`ci.type = ${type}`);
  }

  const whereClause = sql.join(condicoes, sql` AND `);

  return await db.execute(sql`
    SELECT
      ci.id,
      ci.user_id,
      ci.project_id,
      ci.folder_id,
      ci.type,
      ci.title,
      ci.slug,
      ci.description,
      ci.body,
      ci.metadata,
      ci.is_active,
      ci.version,
      ci.created_at,
      ci.updated_at,
      p.slug as project_slug,
      w.slug as workspace_slug,
      'project'::text as source_scope,
      null::text as client_id,
      ts_rank(
        to_tsvector('portuguese', coalesce(ci.title, '') || ' ' || coalesce(ci.body, '') || ' ' || coalesce(ci.description, '')),
        plainto_tsquery('portuguese', ${termo})
      ) as rank,
      coalesce(
        (SELECT json_agg(t.name) FROM content_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.content_id = ci.id),
        '[]'::json
      ) as tags
    FROM content_items ci
    JOIN projects p ON p.id = ci.project_id
    JOIN workspaces w ON w.id = p.workspace_id
    WHERE ${whereClause}
    ORDER BY rank DESC
    LIMIT 50
  `);
}

async function buscarResultadosGlobais({
  userId,
  clientId,
  type,
  termo,
}: {
  userId: string;
  clientId?: string;
  type?: string;
  termo: string;
}) {
  const condicoes = [
    sql`cpi.user_id = ${userId}`,
    sql`to_tsvector('portuguese', coalesce(cpi.title, '') || ' ' || coalesce(cpi.body, '') || ' ' || coalesce(cpi.description, '')) @@ plainto_tsquery('portuguese', ${termo})`,
  ];

  if (clientId) {
    condicoes.push(sql`cp.client_id = ${clientId}`);
  }

  if (type) {
    condicoes.push(sql`cpi.type = ${type}`);
  }

  const whereClause = sql.join(condicoes, sql` AND `);

  return await db.execute(sql`
    SELECT
      cpi.id,
      cpi.user_id,
      null::uuid as project_id,
      null::uuid as folder_id,
      cpi.type,
      cpi.title,
      cpi.slug,
      cpi.description,
      cpi.body,
      cpi.metadata,
      cpi.is_active,
      cpi.version,
      cpi.created_at,
      cpi.updated_at,
      null::text as project_slug,
      null::text as workspace_slug,
      'global'::text as source_scope,
      cp.client_id,
      ts_rank(
        to_tsvector('portuguese', coalesce(cpi.title, '') || ' ' || coalesce(cpi.body, '') || ' ' || coalesce(cpi.description, '')),
        plainto_tsquery('portuguese', ${termo})
      ) as rank,
      coalesce(cpi.metadata->'myinstTags', '[]'::jsonb) as tags
    FROM client_profile_items cpi
    JOIN client_profiles cp ON cp.id = cpi.client_profile_id
    WHERE ${whereClause}
    ORDER BY rank DESC
    LIMIT 50
  `);
}
