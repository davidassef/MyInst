interface PushItem {
  type: string;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface PushParams {
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
  rank: number;
}

interface Projeto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
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

  async pull(params: PullParams): Promise<PullResponse> {
    return this.request<PullResponse>('/sync/pull', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async status(project: string, since?: string): Promise<StatusResponse> {
    const query = new URLSearchParams({ project });
    if (since) query.set('since', since);
    return this.request<StatusResponse>(`/sync/status?${query}`);
  }

  async push(params: PushParams): Promise<PushResponse> {
    return this.request<PushResponse>('/sync/push', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async buscarConteudo(params: { query: string; project?: string; type?: string }): Promise<SearchResultItem[]> {
    const searchParams = new URLSearchParams({ q: params.query });
    if (params.project) searchParams.set('project', params.project);
    if (params.type) searchParams.set('type', params.type);

    return this.request<SearchResultItem[]>(`/search?${searchParams.toString()}`);
  }

  async matchProfile(model: string): Promise<PerfilModelo | null> {
    try {
      return await this.request<PerfilModelo>(`/profiles/match?model=${encodeURIComponent(model)}`);
    } catch {
      return null;
    }
  }

  async listarPastas(project: string): Promise<{ id: string; slug: string; name: string }[]> {
    return this.request(`/projects/${project}/folders`);
  }

  async criarPasta(project: string, body: { name: string; slug: string }): Promise<{ id: string; slug: string; name: string }> {
    return this.request(`/projects/${project}/folders`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
