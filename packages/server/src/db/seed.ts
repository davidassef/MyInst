import { eq } from 'drizzle-orm';
import { db } from './index.js';
import { plans } from './schema.js';

const planosDefault = [
  { name: 'free', maxItems: 50, maxProjects: 3, maxApiKeys: 2, rateLimit: 60 },
  { name: 'pro', maxItems: 500, maxProjects: 20, maxApiKeys: 10, rateLimit: 300 },
  { name: 'unlimited', maxItems: 99999, maxProjects: 999, maxApiKeys: 50, rateLimit: 1000 },
] as const;

export async function seedPlans() {
  for (const plano of planosDefault) {
    const [existente] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.name, plano.name))
      .limit(1);

    if (!existente) {
      await db.insert(plans).values(plano);
    }
  }
}
