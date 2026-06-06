const baseUrl = (process.env.MYINST_SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const sufixo = Date.now();

interface SmokeState {
  token: string;
  apiKey: string;
  workspace: string;
  project: string;
}

async function main() {
  const state: SmokeState = {
    token: '',
    apiKey: '',
    workspace: `smoke-${sufixo}`,
    project: `projeto-${sufixo}`,
  };

  await etapa('health', async () => {
    const body = await request('/health');
    if (body.status !== 'ok') throw new Error('Health não retornou status ok.');
  });

  await etapa('registro', async () => {
    const body = await request('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: `smoke-${sufixo}@myinst.local`,
        password: 'senha-smoke-12345',
        displayName: 'Smoke Test',
      },
    });
    state.token = body.data.token;
  });

  await etapa('login', async () => {
    const body = await request('/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: `smoke-${sufixo}@myinst.local`,
        password: 'senha-smoke-12345',
      },
    });
    if (!body.data.token) throw new Error('Login não retornou token.');
  });

  await etapa('workspace default', async () => {
    const body = await request('/api/v1/workspaces', { token: state.token });
    const possuiDefault = body.data.some((workspace: { slug: string }) => workspace.slug === 'default');
    if (!possuiDefault) throw new Error('Workspace default não encontrado.');
  });

  await etapa('criar workspace', async () => {
    await request('/api/v1/workspaces', {
      method: 'POST',
      token: state.token,
      body: { name: 'Smoke Workspace', slug: state.workspace, description: 'Workspace do smoke test' },
    });
  });

  await etapa('criar projeto', async () => {
    await request(`/api/v1/workspaces/${state.workspace}/projects`, {
      method: 'POST',
      token: state.token,
      body: { name: 'Smoke Projeto', slug: state.project, description: 'Projeto do smoke test' },
    });
  });

  await etapa('criar api key', async () => {
    const body = await request('/api/v1/auth/api-keys', {
      method: 'POST',
      token: state.token,
      body: { name: `smoke-${sufixo}`, scopes: ['read', 'write'] },
    });
    state.apiKey = body.data.key;
  });

  await etapa('sync push', async () => {
    await request('/api/v1/sync/push', {
      method: 'POST',
      token: state.apiKey,
      body: {
        workspace: state.workspace,
        project: state.project,
        items: [{
          type: 'skill',
          title: 'Smoke Skill',
          slug: 'smoke-skill',
          body: 'Conteúdo criado pelo smoke test.',
          metadata: {},
          tags: ['smoke'],
        }],
      },
    });
  });

  await etapa('search', async () => {
    const body = await request(`/api/v1/search?q=smoke&workspace=${state.workspace}&project=${state.project}`, {
      token: state.apiKey,
    });
    if (body.data.length === 0) throw new Error('Busca não retornou conteúdo criado.');
  });

  await etapa('sync pull', async () => {
    const body = await request('/api/v1/sync/pull', {
      method: 'POST',
      token: state.apiKey,
      body: { workspace: state.workspace, project: state.project },
    });
    if (body.data.items.length !== 1) throw new Error('Pull não retornou o conteúdo esperado.');
  });

  await etapa('status', async () => {
    const body = await request(`/api/v1/sync/status?workspace=${state.workspace}&project=${state.project}`, {
      token: state.apiKey,
    });
    if (body.data.changedCount < 1) throw new Error('Status não encontrou alterações.');
  });

  await etapa('isolamento workspace', async () => {
    const body = await request('/api/v1/search?q=smoke&workspace=default&project=default', {
      token: state.apiKey,
    });
    if (body.data.length > 0) throw new Error('Busca vazou conteúdo entre workspaces.');
  });

  console.log(`[SUCCESS] Smoke test concluído contra ${baseUrl}`);
}

async function etapa(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`[SUCCESS] ${nome}`);
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    throw new Error(`[${nome}] ${mensagem}`);
  }
}

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return body;
}

main().catch((error) => {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
