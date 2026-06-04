import { Outlet, Link, useNavigate } from 'react-router-dom';
import { FolderOpen, Key, LogOut, Home } from 'lucide-react';
import { limparToken } from '@/lib/api';

export function Layout() {
  const navigate = useNavigate();

  function handleLogout() {
    limparToken();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-zinc-100">MyInst</h1>
          <p className="text-xs text-zinc-500 mt-1">Vault de Instruções</p>
        </div>

        <nav className="flex-1 space-y-1">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <Home size={18} />
            <span>Workspaces</span>
          </Link>
          <Link
            to="/api-keys"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <Key size={18} />
            <span>API Keys</span>
          </Link>
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors mt-auto"
        >
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </aside>

      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
