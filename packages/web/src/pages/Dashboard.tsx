import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Plus } from 'lucide-react';
import { api } from '@/lib/api';

interface Projeto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
}

export function DashboardPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [descricao, setDescricao] = useState('');

  useEffect(() => {
    api.projetos.listar().then(setProjetos);
  }, []);

  async function criarProjeto(e: React.FormEvent) {
    e.preventDefault();
    const novo = await api.projetos.criar({ name: nome, slug, description: descricao || undefined });
    setProjetos([...projetos, novo]);
    setMostrarForm(false);
    setNome('');
    setSlug('');
    setDescricao('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-zinc-100">Projetos</h2>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
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
                value={nome}
                onChange={(e) => { setNome(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')); }}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Descrição</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
            Criar
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projetos.map((projeto) => (
          <Link
            key={projeto.id}
            to={`/projetos/${projeto.slug}`}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <FolderOpen size={20} className="text-blue-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors">
                  {projeto.name}
                </h3>
                {projeto.description && (
                  <p className="text-sm text-zinc-500 mt-1">{projeto.description}</p>
                )}
                {projeto.isDefault && (
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                    padrão
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
