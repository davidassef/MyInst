import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, estaAutenticado } from '@/lib/api';
import { useBrand } from '@/components/BrandProvider';

type EstadoConexao = 'verificando' | 'precisa_login' | 'pronto' | 'conectando' | 'sucesso' | 'erro';

export function ConnectMcpPage() {
  const navigate = useNavigate();
  const brand = useBrand();
  const [estado, setEstado] = useState<EstadoConexao>('verificando');
  const [erro, setErro] = useState('');
  const [callbackPort, setCallbackPort] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const porta = params.get('callback_port');

    if (!porta || !/^\d+$/.test(porta)) {
      setEstado('erro');
      setErro('Parâmetro callback_port ausente ou inválido.');
      return;
    }

    setCallbackPort(porta);

    if (!estaAutenticado()) {
      setEstado('precisa_login');
      return;
    }

    setEstado('pronto');
  }, []);

  useEffect(() => {
    if (estado === 'precisa_login' && callbackPort) {
      const returnUrl = encodeURIComponent(`/connect-mcp?callback_port=${callbackPort}`);
      navigate(`/login?return_url=${returnUrl}`, { replace: true });
    }
  }, [estado, callbackPort, navigate]);

  async function handleConectar() {
    if (!callbackPort) return;

    setEstado('conectando');
    setErro('');

    try {
      const resultado = await api.mcp.conectar();
      const urlCallback = `http://localhost:${callbackPort}/callback?token=${encodeURIComponent(resultado.key)}`;
      window.location.href = urlCallback;
    } catch (err) {
      setEstado('erro');
      setErro(err instanceof Error ? err.message : 'Erro ao conectar MCP.');
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(95,198,213,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(116,132,154,0.15),_transparent_24%),linear-gradient(180deg,_#04070c_0%,_#061019_42%,_#03060a_100%)] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-25" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center">
        <div className="vault-panel w-full overflow-hidden rounded-[30px] border border-white/8 p-6 shadow-[0_26px_90px_rgba(0,0,0,0.38)] md:p-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(95,198,213,0.14),_transparent_70%)]" />

          <div className="relative text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-cyan-300/16 bg-cyan-400/8 text-cyan-100">
              <Link2 size={28} />
            </div>

            <p className="mt-6 text-xs uppercase tracking-[0.26em] text-slate-500">
              {brand.appName} MCP
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Conectar MCP ao Vault
            </h1>

            <p className="mt-4 text-base leading-7 text-slate-400">
              Autorize o servidor MCP local a acessar sua conta e sincronizar seu vault.
            </p>
          </div>

          <div className="relative mt-8">
            {estado === 'verificando' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 size={32} className="animate-spin text-cyan-300" />
                <p className="text-sm text-slate-400">Verificando conexão...</p>
              </div>
            )}

            {estado === 'precisa_login' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 size={32} className="animate-spin text-cyan-300" />
                <p className="text-sm text-slate-400">Redirecionando para login...</p>
              </div>
            )}

            {estado === 'pronto' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 text-left">
                  <p className="text-sm font-medium text-slate-200">Ao conectar, o MCP poderá:</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-400">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-300" />
                      Ler e sincronizar seu vault pessoal
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-300" />
                      Criar e atualizar projetos, workspaces e conteúdo
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-300" />
                      Importar e exportar configurações de clientes
                    </li>
                  </ul>
                </div>

                <button
                  onClick={handleConectar}
                  className="w-full rounded-2xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-3.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20"
                >
                  Conectar MCP
                </button>

                <p className="text-center text-xs text-slate-500">
                  Uma API key será gerada e vinculada à sua conta.
                </p>
              </div>
            )}

            {estado === 'conectando' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 size={32} className="animate-spin text-cyan-300" />
                <p className="text-sm text-slate-400">Gerando token de conexão...</p>
              </div>
            )}

            {estado === 'sucesso' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <CheckCircle2 size={48} className="text-emerald-400" />
                <p className="text-lg font-medium text-white">Conectado com sucesso!</p>
                <p className="text-sm text-slate-400">Você pode fechar esta aba e voltar ao seu cliente MCP.</p>
              </div>
            )}

            {estado === 'erro' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-4 py-4">
                  <XCircle size={48} className="text-red-400" />
                  <p className="text-center text-sm text-red-200">{erro}</p>
                </div>

                {estado === 'erro' && callbackPort && (
                  <button
                    onClick={() => {
                      setEstado('pronto');
                      setErro('');
                    }}
                    className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
