import './env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.js';
import { oauthRoutes } from './routes/oauth.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { projectRoutes } from './routes/projects.js';
import { contentRoutes } from './routes/content.js';
import { syncRoutes } from './routes/sync.js';
import { tagRoutes } from './routes/tags.js';
import { searchRoutes } from './routes/search.js';
import { profileRoutes } from './routes/profiles.js';
import { usageRoutes } from './routes/usage.js';
import { seedPlans } from './db/seed.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET! });

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    return (request.user as { id?: string } | undefined)?.id || request.ip;
  },
});

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

await app.register(authRoutes, { prefix: '/api/v1/auth' });
await app.register(oauthRoutes, { prefix: '/api/v1/auth' });
await app.register(workspaceRoutes, { prefix: '/api/v1' });
await app.register(projectRoutes, { prefix: '/api/v1' });
await app.register(contentRoutes, { prefix: '/api/v1' });
await app.register(syncRoutes, { prefix: '/api/v1/sync' });
await app.register(tagRoutes, { prefix: '/api/v1/tags' });
await app.register(searchRoutes, { prefix: '/api/v1' });
await app.register(profileRoutes, { prefix: '/api/v1/profiles' });
await app.register(usageRoutes, { prefix: '/api/v1/usage' });

const port = Number(process.env.PORT) || 3000;

try {
  await seedPlans();
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export { app };
