import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { eq } from 'drizzle-orm';
import { authRoutes } from '../src/routes/auth.js';
import { workspaceRoutes } from '../src/routes/workspaces.js';
import { projectRoutes } from '../src/routes/projects.js';
import { contentRoutes } from '../src/routes/content.js';
import { syncRoutes } from '../src/routes/sync.js';
import { tagRoutes } from '../src/routes/tags.js';
import { searchRoutes } from '../src/routes/search.js';
import { profileRoutes } from '../src/routes/profiles.js';
import { usageRoutes } from '../src/routes/usage.js';
import { seedPlans } from '../src/db/seed.js';
import { db } from '../src/db/index.js';
import { plans, users } from '../src/db/schema.js';

function criarApp() {
  const app = Fastify();
  app.register(cors, { origin: true });
  app.register(jwt, { secret: 'test-secret' });
  app.get('/health', async () => ({ status: 'ok' }));
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(workspaceRoutes, { prefix: '/api/v1' });
  app.register(projectRoutes, { prefix: '/api/v1' });
  app.register(contentRoutes, { prefix: '/api/v1' });
  app.register(syncRoutes, { prefix: '/api/v1/sync' });
  app.register(tagRoutes, { prefix: '/api/v1/tags' });
  app.register(searchRoutes, { prefix: '/api/v1' });
  app.register(profileRoutes, { prefix: '/api/v1/profiles' });
  app.register(usageRoutes, { prefix: '/api/v1/usage' });
  return app;
}

describe('MyInst API', () => {
  const app = criarApp();
  let token: string;
  let apiKey: string;
  const workspaceSecundarioSlug = 'cliente-acme';

  beforeAll(async () => {
    await seedPlans();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /health retorna status ok', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty('status', 'ok');
    });
  });

  describe('Auth', () => {
    const email = `test-${Date.now()}@myinst.dev`;

    it('POST /auth/register cria usuário e retorna token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'senha12345', displayName: 'Teste Vitest' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.user.email).toBe(email);
      expect(body.data.token).toBeDefined();
      token = body.data.token;
    });

    it('POST /auth/register rejeita email duplicado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'outrasenha', displayName: 'Outro' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST /auth/login retorna token válido', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'senha12345' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.token).toBeDefined();
    });

    it('POST /auth/login rejeita senha errada', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'errada' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /auth/me retorna perfil do usuário', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.email).toBe(email);
    });

    it('POST /auth/api-keys gera API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Test Key', scopes: ['read', 'write'] },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.key).toMatch(/^myinst_/);
      apiKey = body.data.key;
    });

    it('GET /workspaces lista o workspace default criado no cadastro', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );
    });

    it('GET /auth/api-keys lista keys do usuário', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/api-keys',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('autenticação via API key funciona', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('JWT com usuário inexistente retorna 401', async () => {
      const tokenOrfao = app.jwt.sign({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'orfao@local.dev',
        displayName: 'Órfão',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${tokenOrfao}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Projects', () => {
    it('GET /projects lista projetos (inclui default)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const projetos = res.json().data;
      expect(projetos.length).toBeGreaterThan(0);
      expect(projetos.some((p: any) => p.isDefault)).toBe(true);
    });

    it('POST /projects cria novo projeto', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'Meu SaaS', slug: 'meu-saas', description: 'Projeto teste' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('meu-saas');
    });

    it('POST /projects rejeita slug duplicado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'Outro', slug: 'meu-saas' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('DELETE /projects/:slug não permite deletar default', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/projects/default',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Workspaces', () => {
    it('POST /workspaces cria novo workspace e projeto default', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/workspaces',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          name: 'Cliente Acme',
          slug: workspaceSecundarioSlug,
          description: 'Workspace de teste',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe(workspaceSecundarioSlug);

      const projetosRes = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(projetosRes.statusCode).toBe(200);
      expect(projetosRes.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );
    });

    it('permite o mesmo slug de projeto em workspaces diferentes', async () => {
      const projetosDefaultRes = await app.inject({
        method: 'GET',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(projetosDefaultRes.statusCode).toBe(200);
      expect(projetosDefaultRes.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );

      const projetosWorkspaceRes = await app.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(projetosWorkspaceRes.statusCode).toBe(200);
      expect(projetosWorkspaceRes.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'default',
            isDefault: true,
          }),
        ]),
      );
    });
  });

  describe('Tags', () => {
    it('POST /tags cria tag', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/tags',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'claude-sonnet', category: 'model', color: '#3B82F6' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.name).toBe('claude-sonnet');
    });

    it('GET /tags lista tags', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/tags',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });
  });

  describe('Content', () => {
    it('POST /projects/:slug/content cria skill', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'skill',
          title: 'Debug Skill',
          slug: 'debug-skill',
          body: 'Use debugging sistematico.',
          metadata: {},
          tags: ['claude-sonnet'],
          isActive: true,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('debug-skill');
    });

    it('POST /workspaces/:workspaceSlug/projects/:projectSlug/content cria skill isolada em outro workspace', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/workspaces/${workspaceSecundarioSlug}/projects/default/content`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: {
          type: 'skill',
          title: 'Acme Skill',
          slug: 'acme-skill',
          body: 'Skill exclusiva do workspace Acme.',
          metadata: {},
          tags: ['claude-sonnet'],
          isActive: true,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data.slug).toBe('acme-skill');
    });

    it('GET /projects/:slug/content lista conteúdos', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('PATCH /projects/:slug/content/:contentSlug atualiza e versiona', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/projects/default/content/debug-skill',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { body: 'Use debugging sistematico v2.' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.version).toBe(2);
    });

    it('GET /versions retorna histórico', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content/debug-skill/versions',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBe(1);
      expect(res.json().data[0].version).toBe(1);
    });

    it('GET /diff retorna alterações entre versões', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content/debug-skill/diff?v1=1&v2=2',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.v1).toBe(1);
      expect(body.data.v2).toBe(2);
      expect(body.data.changes.length).toBeGreaterThan(0);
      const tipos = body.data.changes.map((c: any) => c.type);
      expect(tipos.some((t: string) => t === 'added' || t === 'removed')).toBe(true);
    });

    it('GET /diff com v2 omitido compara com versão atual', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/projects/default/content/debug-skill/diff?v1=1',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.v1).toBe(1);
      expect(body.data.v2).toBe(2);
      expect(body.data.changes.length).toBeGreaterThan(0);
    });

    it('POST /restore reverte para versão anterior e incrementa versão', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content/debug-skill/restore',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { version: 1 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.version).toBe(3);
      expect(body.data.body).toBe('Use debugging sistematico.');
    });

    it('POST /restore com versão inválida retorna 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content/debug-skill/restore',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { version: 999 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Sync', () => {
    it('POST /sync/pull retorna todos os itens do projeto', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'default' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.syncToken).toBeDefined();
      expect(body.serverTime).toBeDefined();
    });

    it('POST /sync/pull filtra por tag', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'default', tags: ['claude-sonnet'] },
      });
      expect(res.statusCode).toBe(200);
      const items = res.json().data.items;
      items.forEach((item: any) => {
        expect(item.tags).toContain('claude-sonnet');
      });
    });

    it('POST /sync/pull com tag inexistente retorna vazio', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'default', tags: ['modelo-inexistente'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.items).toHaveLength(0);
    });

    it('POST /sync/pull com projeto inexistente retorna 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { project: 'nao-existe' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /sync/pull usa workspace explícito quando informado', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sync/pull',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { workspace: workspaceSecundarioSlug, project: 'default' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'acme-skill',
          }),
        ]),
      );
    });
  });

  describe('Search', () => {
    it('GET /search retorna resultados pelo título', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].title).toContain('Debug');
    });

    it('GET /search retorna resultados pelo body', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=sistematico',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('GET /search retorna vazio para termo sem correspondência', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=xyzinexistente999',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it('GET /search filtra por projeto', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug&project=default',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      body.data.forEach((item: any) => {
        expect(item.project_slug).toBe('default');
      });
    });

    it('GET /search filtra por tipo', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug&type=skill',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      body.data.forEach((item: any) => {
        expect(item.type).toBe('skill');
      });
    });

    it('GET /search retorna 400 sem parâmetro q', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /search inclui tags nos resultados', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Debug',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].tags).toBeDefined();
      expect(Array.isArray(body.data[0].tags)).toBe(true);
    });

    it('GET /search não vaza conteúdo de outro workspace no modo legado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Acme',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });

    it('GET /search encontra conteúdo quando workspace é informado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/search?q=Acme&workspace=${workspaceSecundarioSlug}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            slug: 'acme-skill',
          }),
        ]),
      );
    });
  });

  describe('Profiles', () => {
    let perfilId: string;

    it('POST /profiles cria perfil de modelo', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/profiles',
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { name: 'Claude Opus', modelPattern: 'claude-opus.*', tags: ['claude-opus'] },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.name).toBe('Claude Opus');
      expect(body.data.tags).toContain('claude-opus');
      perfilId = body.data.id;
    });

    it('GET /profiles lista perfis do usuário', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBeGreaterThan(0);
    });

    it('GET /profiles/match encontra perfil pelo padrão', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/match?model=claude-opus-4',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe('Claude Opus');
      expect(res.json().data.tags).toContain('claude-opus');
    });

    it('GET /profiles/match retorna 404 quando não há correspondência', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/match?model=gpt-4o',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /profiles/match respeita o workspace informado', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/match?model=claude-opus-4&workspace=${workspaceSecundarioSlug}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PATCH /profiles/:id atualiza perfil', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/profiles/${perfilId}`,
        headers: { authorization: `Bearer ${apiKey}` },
        payload: { tags: ['claude-opus', 'premium'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.tags).toContain('premium');
    });

    it('DELETE /profiles/:id remove perfil', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/profiles/${perfilId}`,
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(res.statusCode).toBe(204);
    });
  });

  describe('Usage & Limits', () => {
    it('GET /usage retorna informações do plano e contagens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/usage',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.plan).toBeDefined();
      expect(body.data.usage.items).toHaveProperty('current');
      expect(body.data.usage.items).toHaveProperty('max');
      expect(body.data.usage.projects).toHaveProperty('current');
      expect(body.data.usage.projects).toHaveProperty('max');
      expect(body.data.usage.apiKeys).toHaveProperty('current');
      expect(body.data.usage.apiKeys).toHaveProperty('max');
    });

    it('criar conteúdo além do limite retorna 403', async () => {
      const [planoRestrito] = await db.insert(plans).values({
        name: `test-limit-${Date.now()}`,
        maxItems: 0,
        maxProjects: 0,
        maxApiKeys: 0,
        rateLimit: 60,
      }).returning();

      const decoded = app.jwt.decode(token) as { id: string };
      await db
        .update(users)
        .set({ planId: planoRestrito.id })
        .where(eq(users.id, decoded.id));

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/default/content',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'skill',
          title: 'Blocked Skill',
          slug: `blocked-${Date.now()}`,
          body: 'Deveria ser bloqueado.',
          metadata: {},
          tags: [],
          isActive: true,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('LIMIT_EXCEEDED');

      const [planoFree] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.name, 'free'))
        .limit(1);

      await db
        .update(users)
        .set({ planId: planoFree.id })
        .where(eq(users.id, decoded.id));
    });
  });
});
