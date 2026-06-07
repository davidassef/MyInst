import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Pencil, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { gerarSlug } from '@/lib/slug';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
}

interface FormularioWorkspace {
  name: string;
  slug: string;
  description: string;
}

const FORM_INICIAL = { name: '', slug: '', description: '' };

export function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formCriacao, setFormCriacao] = useState<FormularioWorkspace>(FORM_INICIAL);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormularioWorkspace>(FORM_INICIAL);
  const [slugCriacaoManual, setSlugCriacaoManual] = useState(false);
  const [slugEdicaoManual, setSlugEdicaoManual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');

  useEffect(() => {
    api.workspaces.listar().then(setWorkspaces);
  }, []);

  async function criarWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm('');

    try {
      const novo = await api.workspaces.criar({
        name: formCriacao.name,
        slug: formCriacao.slug,
        description: formCriacao.description || undefined,
      });

      setWorkspaces([...workspaces, novo]);
      setMostrarForm(false);
      setFormCriacao(FORM_INICIAL);
      setSlugCriacaoManual(false);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao criar workspace');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(workspace: Workspace) {
    setEditandoId(workspace.id);
    setFormEdicao({
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description ?? '',
    });
    setSlugEdicaoManual(false);
    setErroForm('');
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setFormEdicao(FORM_INICIAL);
    setSlugEdicaoManual(false);
    setErroForm('');
  }

  async function salvarEdicaoWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoId) return;

    const workspaceAtual = workspaces.find((workspace) => workspace.id === editandoId);
    if (!workspaceAtual) return;

    setSalvando(true);
    setErroForm('');

    try {
      const atualizado = await api.workspaces.atualizar(workspaceAtual.slug, {
        name: formEdicao.name,
        slug: formEdicao.slug,
        description: formEdicao.description || undefined,
      });

      setWorkspaces(workspaces.map((workspace) => (workspace.id === atualizado.id ? atualizado : workspace)));
      cancelarEdicao();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar workspace');
    } finally {
      setSalvando(false);
    }
  }

  function atualizarNomeCriacao(valor: string) {
    setFormCriacao((atual) => ({
      ...atual,
      name: valor,
      slug: slugCriacaoManual ? atual.slug : gerarSlug(valor),
    }));
  }

  function atualizarNomeEdicao(valor: string) {
    setFormEdicao((atual) => ({
      ...atual,
      name: valor,
      slug: slugEdicaoManual ? atual.slug : gerarSlug(valor),
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-zinc-100">Workspaces</h2>
        <button
          onClick={() => {
            setMostrarForm(!mostrarForm);
            setErroForm('');
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={16} />
          Novo Workspace
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={criarWorkspace} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Nome</label>
              <input
                type="text"
                value={formCriacao.name}
                onChange={(e) => atualizarNomeCriacao(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Slug</label>
              <input
                type="text"
                value={formCriacao.slug}
                onChange={(e) => {
                  setSlugCriacaoManual(true);
                  setFormCriacao((atual) => ({ ...atual, slug: gerarSlug(e.target.value) }));
                }}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Descrição</label>
            <input
              type="text"
              value={formCriacao.description}
              onChange={(e) => setFormCriacao((atual) => ({ ...atual, description: e.target.value }))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          {erroForm && <p className="text-sm text-red-400">{erroForm}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={salvando} className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors">
              {salvando ? 'Salvando...' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarForm(false);
                setFormCriacao(FORM_INICIAL);
                setSlugCriacaoManual(false);
                setErroForm('');
              }}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.map((workspace) => {
          const estaEditando = editandoId === workspace.id;

          return (
            <div key={workspace.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              {estaEditando ? (
                <form onSubmit={salvarEdicaoWorkspace} className="space-y-3">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Nome</label>
                    <input
                      type="text"
                      value={formEdicao.name}
                      onChange={(e) => atualizarNomeEdicao(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Slug</label>
                    <input
                      type="text"
                      value={formEdicao.slug}
                      onChange={(e) => {
                        setSlugEdicaoManual(true);
                        setFormEdicao((atual) => ({ ...atual, slug: gerarSlug(e.target.value) }));
                      }}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Descrição</label>
                    <input
                      type="text"
                      value={formEdicao.description}
                      onChange={(e) => setFormEdicao((atual) => ({ ...atual, description: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {erroForm && <p className="text-sm text-red-400">{erroForm}</p>}
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={salvando} className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                      {salvando ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button type="button" onClick={cancelarEdicao} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors">
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/workspaces/${workspace.slug}`}
                      className="flex items-start gap-3 group min-w-0"
                    >
                      <Boxes size={20} className="text-blue-400 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors">
                          {workspace.name}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">{workspace.slug}</p>
                        {workspace.description && (
                          <p className="text-sm text-zinc-500 mt-2">{workspace.description}</p>
                        )}
                        {workspace.isDefault && (
                          <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                            padrão
                          </span>
                        )}
                      </div>
                    </Link>
                    <button
                      onClick={() => iniciarEdicao(workspace)}
                      className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      aria-label={`Editar ${workspace.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
