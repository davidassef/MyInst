import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { autenticar } from '../middleware/auth.js';
import { obterWorkspaceDefault, resolverWorkspaceDoUsuario } from '../lib/workspaces.js';

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/search', async (request, reply) => {
    const { q, project, type } = request.query as {
      q?: string;
      workspace?: string;
      project?: string;
      type?: string;
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

    if (!workspace) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Workspace não encontrado', status: 404 },
      });
    }

    const condicoes = [
      sql`ci.user_id = ${userId}`,
      sql`p.workspace_id = ${workspace.id}`,
      sql`to_tsvector('portuguese', coalesce(ci.title, '') || ' ' || coalesce(ci.body, '') || ' ' || coalesce(ci.description, '')) @@ plainto_tsquery('portuguese', ${termo})`,
    ];

    if (project) {
      condicoes.push(sql`p.slug = ${project}`);
    }

    if (type) {
      condicoes.push(sql`ci.type = ${type}`);
    }

    const whereClause = sql.join(condicoes, sql` AND `);

    const resultados = await db.execute(sql`
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
      WHERE ${whereClause}
      ORDER BY rank DESC
      LIMIT 50
    `);

    return {
      data: resultados,
      meta: { total: resultados.length, query: termo },
    };
  });
}
