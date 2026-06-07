interface PushItem {
  type: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface PushParams {
  workspace?: string;
  project: string;
  folderSlug?: string;
  items: PushItem[];
}

interface PushResponse {
  created: string[];
  updated: string[];
  serverTime: string;
}

interface PullParams {
  workspace?: string;
  project: string;
  types?: string[];
  tags?: string[];
  since?: string;
}

interface ConteudoItem {
  id: string;
  type: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface PullResponse {
  items: ConteudoItem[];
  syncToken: string;
  serverTime: string;
}

interface StatusResponse {
  changedCount: number;
  items: { id: string; slug: string; type: string; updatedAt: string }[];
  serverTime: string;
}

interface SearchResultItem extends ConteudoItem {
  project_slug: string;
  workspace_slug?: string;
  rank: number;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
}

interface Projeto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  workspaceId?: string | null;
}

interface PerfilModelo {
  id: string;
  name: string;
  modelPattern: string;
  tags: string[];
}

export class MyInstClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`MyInst API error (${response.status}): ${error.error?.message || response.statusText}`);
    }

    const json = await response.json();
    return json.data ?? json;
  }

  async listarProjetos(): Promise<Projeto[]> {
    return this.request<Projeto[]>('/projects');
  }

  async listarWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>('/workspaces');
  }

  async listarProjetosDoWorkspace(workspace?: string): Promise<Projeto[]> {
    if (!workspace) {
      return this.listarProjetos();
    }

    return this.request<Projeto[]>(`/workspaces/${encodeURIComponent(workspace)}/projects`);
  }

  async criarProjeto(
    body: { name: string; slug: string; description?: string },
    workspace?: string,
  ): Promise<Projeto> {
    if (workspace) {
      return this.request<Projeto>(`/workspaces/${encodeURIComponent(workspace)}/projects`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    return this.request<Projeto>('/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async pull(params: PullParams): Promise<PullResponse> {
    return this.request<PullResponse>('/sync/pull', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async status(project: string, since?: string, workspace?: string): Promise<StatusResponse> {
    const query = new URLSearchParams({ project });
    if (since) query.set('since', since);
    if (workspace) query.set('workspace', workspace);
    return this.request<StatusResponse>(`/sync/status?${query}`);
  }

  async push(params: PushParams): Promise<PushResponse> {
    return this.request<PushResponse>('/sync/push', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async buscarConteudo(params: { query: string; workspace?: string; project?: string; type?: string }): Promise<SearchResultItem[]> {
    const searchParams = new URLSearchParams({ q: params.query });
    if (params.workspace) searchParams.set('workspace', params.workspace);
    if (params.project) searchParams.set('project', params.project);
    if (params.type) searchParams.set('type', params.type);

    return this.request<SearchResultItem[]>(`/search?${searchParams.toString()}`);
  }

  async matchProfile(model: string, workspace?: string): Promise<PerfilModelo | null> {
    try {
      const searchParams = new URLSearchParams({ model });
      if (workspace) searchParams.set('workspace', workspace);
      return await this.request<PerfilModelo>(`/profiles/match?${searchParams.toString()}`);
    } catch {
      return null;
    }
  }

  async listarPastas(project: string, workspace?: string): Promise<{ id: string; slug: string; name: string }[]> {
    if (workspace) {
      return this.request(`/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/folders`);
    }

    return this.request(`/projects/${project}/folders`);
  }

  async criarPasta(project: string, body: { name: string; slug: string }, workspace?: string): Promise<{ id: string; slug: string; name: string }> {
    if (workspace) {
      return this.request(`/workspaces/${encodeURIComponent(workspace)}/projects/${encodeURIComponent(project)}/folders`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    return this.request(`/projects/${project}/folders`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
