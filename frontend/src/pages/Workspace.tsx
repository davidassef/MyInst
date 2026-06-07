import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderOpen, Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { gerarSlug } from '@/lib/slug';

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
}

interface Formulario {
  name: string;
  slug: string;
  description: string;
}

const FORM_INICIAL = { name: '', slug: '', description: '' };

export function WorkspacePage() {
  const navigate = useNavigate();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formCriacao, setFormCriacao] = useState<Formulario>(FORM_INICIAL);
  const [slugCriacaoManual, setSlugCriacaoManual] = useState(false);
  const [editandoWorkspace, setEditandoWorkspace] = useState(false);
  const [editandoProjetoId, setEditandoProjetoId] = useState<string | null>(null);
  const [formEdicaoWorkspace, setFormEdicaoWorkspace] = useState<Formulario>(FORM_INICIAL);
  const [formEdicaoProjeto, setFormEdicaoProjeto] = useState<Formulario>(FORM_INICIAL);
  const [slugWorkspaceManual, setSlugWorkspaceManual] = useState(false);
  const [slugProjetoManual, setSlugProjetoManual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState('');

  useEffect(() => {
    if (!workspaceSlug) return;

    api.workspaces.obter(workspaceSlug).then(setWorkspace);
    api.projetos.listar(workspaceSlug).then(setProjetos);
  }, [workspaceSlug]);

  async function criarProjeto(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceSlug) return;

    setSalvando(true);
    setErroForm('');

    try {
      const novo = await api.projetos.criar(workspaceSlug, {
        name: formCriacao.name,
        slug: formCriacao.slug,
        description: formCriacao.description || undefined,
      });

      setProjetos([...projetos, novo]);
      setMostrarForm(false);
      setFormCriacao(FORM_INICIAL);
      setSlugCriacaoManual(false);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao criar projeto');
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

  function iniciarEdicaoWorkspace() {
    if (!workspace) return;

    setEditandoWorkspace(true);
    setFormEdicaoWorkspace({
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description ?? '',
    });
    setSlugWorkspaceManual(false);
    setErroForm('');
  }

  function iniciarEdicaoProjeto(projeto: Projeto) {
    setEditandoProjetoId(projeto.id);
    setFormEdicaoProjeto({
      name: projeto.name,
      slug: projeto.slug,
      description: projeto.description ?? '',
    });
    setSlugProjetoManual(false);
    setErroForm('');
  }

  function cancelarEdicao() {
    setEditandoWorkspace(false);
    setEditandoProjetoId(null);
    setFormEdicaoWorkspace(FORM_INICIAL);
    setFormEdicaoProjeto(FORM_INICIAL);
    setSlugWorkspaceManual(false);
    setSlugProjetoManual(false);
    setErroForm('');
  }

  async function salvarWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !workspaceSlug) return;

    setSalvando(true);
    setErroForm('');

    try {
      const atualizado = await api.workspaces.atualizar(workspaceSlug, {
        name: formEdicaoWorkspace.name,
        slug: formEdicaoWorkspace.slug,
        description: formEdicaoWorkspace.description || undefined,
      });

      setWorkspace(atualizado);
      setEditandoWorkspace(false);

      if (atualizado.slug !== workspaceSlug) {
        navigate(`/workspaces/${atualizado.slug}`, { replace: true });
      }
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar workspace');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarProjeto(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceSlug || !editandoProjetoId) return;

    const projetoAtual = projetos.find((projeto) => projeto.id === editandoProjetoId);
    if (!projetoAtual) return;

    setSalvando(true);
    setErroForm('');

    try {
      const atualizado = await api.projetos.atualizar(workspaceSlug, projetoAtual.slug, {
        name: formEdicaoProjeto.name,
        slug: formEdicaoProjeto.slug,
        description: formEdicaoProjeto.description || undefined,
      });

      setProjetos(projetos.map((projeto) => (projeto.id === atualizado.id ? atualizado : projeto)));
      setEditandoProjetoId(null);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : 'Erro ao salvar projeto');
    } finally {
      setSalvando(false);
    }
  }

  function atualizarNomeWorkspace(valor: string) {
    setFormEdicaoWorkspace((atual) => ({
      ...atual,
      name: valor,
      slug: slugWorkspaceManual ? atual.slug : gerarSlug(valor),
    }));
  }

  function atualizarNomeProjeto(valor: string) {
    setFormEdicaoProjeto((atual) => ({
      ...atual,
      name: valor,
      slug: slugProjetoManual ? atual.slug : gerarSlug(valor),
    }));
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-6">
        <Link to="/" className="text-zinc-400 hover:text-zinc-200 mt-1">
          <ArrowLeft size={20} />
        </Link>

        <div className="flex-1">
          {editandoWorkspace ? (
            <form onSubmit={salvarWorkspace} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Nome</label>
                  <input
                    type="text"
                    value={formEdicaoWorkspace.name}
                    onChange={(e) => atualizarNomeWorkspace(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Slug</label>
                  <input
                    type="text"
                    value={formEdicaoWorkspace.slug}
                    onChange={(e) => {
                      setSlugWorkspaceManual(true);
                      setFormEdicaoWorkspace((atual) => ({ ...atual, slug: gerarSlug(e.target.value) }));
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
                  value={formEdicaoWorkspace.description}
                  onChange={(e) => setFormEdicaoWorkspace((atual) => ({ ...atual, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              {erroForm && <p className="text-sm text-red-400">{erroForm}</p>}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={salvando} className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" onClick={cancelarEdicao} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-zinc-100">{workspace?.name ?? workspaceSlug}</h2>
                  <button onClick={iniciarEdicaoWorkspace} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                    <Pencil size={16} />
                  </button>
                </div>
                <p className="text-sm text-zinc-500 mt-1">{workspace?.slug ?? workspaceSlug}</p>
                {workspace?.description && <p className="text-sm text-zinc-400 mt-2">{workspace.description}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-zinc-200">Projetos</h3>
        <button
          onClick={() => {
            setMostrarForm(!mostrarForm);
            setErroForm('');
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={16} />
          Novo Projeto
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={criarProjeto} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 space-y-3">
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
        {projetos.map((projeto) => {
          const estaEditando = editandoProjetoId === projeto.id;

          return (
            <div key={projeto.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              {estaEditando ? (
                <form onSubmit={salvarProjeto} className="space-y-3">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Nome</label>
                    <input
                      type="text"
                      value={formEdicaoProjeto.name}
                      onChange={(e) => atualizarNomeProjeto(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Slug</label>
                    <input
                      type="text"
                      value={formEdicaoProjeto.slug}
                      onChange={(e) => {
                        setSlugProjetoManual(true);
                        setFormEdicaoProjeto((atual) => ({ ...atual, slug: gerarSlug(e.target.value) }));
                      }}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Descrição</label>
                    <input
                      type="text"
                      value={formEdicaoProjeto.description}
                      onChange={(e) => setFormEdicaoProjeto((atual) => ({ ...atual, description: e.target.value }))}
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
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to={`/workspaces/${workspaceSlug}/projetos/${projeto.slug}`}
                    className="flex items-start gap-3 group min-w-0"
                  >
                    <FolderOpen size={20} className="text-blue-400 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors">
                        {projeto.name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">{projeto.slug}</p>
                      {projeto.description && <p className="text-sm text-zinc-500 mt-2">{projeto.description}</p>}
                      {projeto.isDefault && (
                        <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                          padrão
                        </span>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => iniciarEdicaoProjeto(projeto)}
                    className="text-zinc-500 hover:text-zinc-200 transition-colors"
                    aria-label={`Editar ${projeto.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
