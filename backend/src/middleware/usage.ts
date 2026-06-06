import { eq, and, count } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { users, plans, contentItems, projects, apiKeys } from '../db/schema.js';

async function obterLimitesPlano(userId: string) {
  const [usuario] = await db
    .select({ planId: users.planId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!usuario?.planId) return null;

  const [plano] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, usuario.planId))
    .limit(1);

  return plano ?? null;
}

export async function verificarLimiteConteudo(request: FastifyRequest, reply: FastifyReply) {
  const plano = await obterLimitesPlano(request.user.id);
  if (!plano) return;

  const [resultado] = await db
    .select({ total: count() })
    .from(contentItems)
    .where(eq(contentItems.userId, request.user.id));

  if (resultado.total >= plano.maxItems) {
    return reply.status(403).send({
      error: {
        code: 'LIMIT_EXCEEDED',
        message: `Limite de ${plano.maxItems} itens atingido no plano ${plano.name}`,
        status: 403,
      },
    });
  }
}

export async function verificarLimiteProjetos(request: FastifyRequest, reply: FastifyReply) {
  const plano = await obterLimitesPlano(request.user.id);
  if (!plano) return;

  const [resultado] = await db
    .select({ total: count() })
    .from(projects)
    .where(eq(projects.userId, request.user.id));

  if (resultado.total >= plano.maxProjects) {
    return reply.status(403).send({
      error: {
        code: 'LIMIT_EXCEEDED',
        message: `Limite de ${plano.maxProjects} projetos atingido no plano ${plano.name}`,
        status: 403,
      },
    });
  }
}

export async function verificarLimiteApiKeys(request: FastifyRequest, reply: FastifyReply) {
  const plano = await obterLimitesPlano(request.user.id);
  if (!plano) return;

  const [resultado] = await db
    .select({ total: count() })
    .from(apiKeys)
    .where(eq(apiKeys.userId, request.user.id));

  if (resultado.total >= plano.maxApiKeys) {
    return reply.status(403).send({
      error: {
        code: 'LIMIT_EXCEEDED',
        message: `Limite de ${plano.maxApiKeys} API keys atingido no plano ${plano.name}`,
        status: 403,
      },
    });
  }
}
