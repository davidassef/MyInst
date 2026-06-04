import { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nome, setNome] = useState('');
  const [novaKey, setNovaKey] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    api.auth.listarApiKeys().then(setKeys);
  }, []);

  async function criarKey(e: React.FormEvent) {
    e.preventDefault();
    const resultado = await api.auth.criarApiKey({ name: nome, scopes: ['read', 'write'] });
    setNovaKey(resultado.key);
    setKeys([...keys, resultado]);
    setMostrarForm(false);
    setNome('');
  }

  async function deletarKey(id: string) {
    await api.auth.deletarApiKey(id);
    setKeys(keys.filter((k) => k.id !== id));
  }

  function copiarKey() {
    navigator.clipboard.writeText(novaKey);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-zinc-100">API Keys</h2>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={16} />
          Nova Key
        </button>
      </div>

      {novaKey && (
        <div className="bg-green-950 border border-green-800 rounded-xl p-4 mb-6">
          <p className="text-green-300 text-sm mb-2">
            API key criada. Copie agora — ela não será exibida novamente.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-zinc-900 px-3 py-2 rounded-lg text-green-200 font-mono text-sm">
              {novaKey}
            </code>
            <button
              onClick={copiarKey}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
            >
              {copiado ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
          <button
            onClick={() => setNovaKey('')}
            className="mt-3 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Fechar
          </button>
        </div>
      )}

      {mostrarForm && (
        <form onSubmit={criarKey} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm text-zinc-400 mb-1">Nome do dispositivo</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: MacBook Pro, PC Trabalho"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
            Gerar
          </button>
        </form>
      )}

      <div className="space-y-2">
        {keys.map((key) => (
          <div key={key.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Key size={16} className="text-zinc-500" />
              <div>
                <p className="text-zinc-200 font-medium">{key.name}</p>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">{key.keyPrefix}...</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-zinc-500">
                {key.lastUsedAt
                  ? `Usado em ${new Date(key.lastUsedAt).toLocaleDateString('pt-BR')}`
                  : 'Nunca usado'}
              </span>
              <button
                onClick={() => deletarKey(key.id)}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {keys.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-8">Nenhuma API key criada.</p>
        )}
      </div>

      <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Como usar</h3>
        <p className="text-sm text-zinc-500 mb-3">
          Configure a API key no seu MCP server para sincronizar suas instruções:
        </p>
        <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 font-mono overflow-x-auto">{`{
  "mcpServers": {
    "myinst": {
      "command": "myinst-mcp",
      "env": {
        "MYINST_API_KEY": "sua_key_aqui",
        "MYINST_SERVER": "http://localhost:3000"
      }
    }
  }
}`}</pre>
      </div>
    </div>
  );
}
