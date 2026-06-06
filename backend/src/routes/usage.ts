import type { FastifyInstance } from 'fastify';
import { eq, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, plans, contentItems, projects, apiKeys } from '../db/schema.js';
import { autenticar } from '../middleware/auth.js';

export async function usageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', autenticar);

  app.get('/', async (request, reply) => {
    const [usuario] = await db
      .select({ planId: users.planId })
      .from(users)
      .where(eq(users.id, request.user.id))
      .limit(1);

    let nomePlano = 'free';
    let limites = { maxItems: 50, maxProjects: 3, maxApiKeys: 2 };

    if (usuario?.planId) {
      const [plano] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, usuario.planId))
        .limit(1);

      if (plano) {
        nomePlano = plano.name;
        limites = {
          maxItems: plano.maxItems,
          maxProjects: plano.maxProjects,
          maxApiKeys: plano.maxApiKeys,
        };
      }
    }

    const [totalItens] = await db
      .select({ total: count() })
      .from(contentItems)
      .where(eq(contentItems.userId, request.user.id));

    const [totalProjetos] = await db
      .select({ total: count() })
      .from(projects)
      .where(eq(projects.userId, request.user.id));

    const [totalApiKeys] = await db
      .select({ total: count() })
      .from(apiKeys)
      .where(eq(apiKeys.userId, request.user.id));

    return {
      data: {
        plan: nomePlano,
        usage: {
          items: { current: totalItens.total, max: limites.maxItems },
          projects: { current: totalProjetos.total, max: limites.maxProjects },
          apiKeys: { current: totalApiKeys.total, max: limites.maxApiKeys },
        },
      },
    };
  });
}
