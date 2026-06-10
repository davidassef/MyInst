import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, salvarToken } from '@/lib/api';
import { useBrand } from '@/components/BrandProvider';

export function LoginPage() {
  const navigate = useNavigate();
  const brand = useBrand();
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const returnUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenOAuth = params.get('token');
    const erroOAuth = params.get('oauth_error');
    const redirectUrl = params.get('return_url');

    if (tokenOAuth) {
      salvarToken(tokenOAuth);
      navigate(redirectUrl || '/', { replace: true });
      return;
    }

    if (erroOAuth) {
      setErro('Não foi possível concluir o login OAuth.');
      window.history.replaceState(null, '', '/login');
    }

    if (redirectUrl) {
      returnUrlRef.current = redirectUrl;
      setReturnUrl(redirectUrl);
    }
  }, [navigate]);

  const ehFluxoMcp = returnUrlRef.current?.includes('connect-mcp');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      if (modo === 'registro') {
        const resultado = await api.auth.registrar({ email, password, displayName });
        salvarToken(resultado.token);
      } else {
        const resultado = await api.auth.login({ email, password });
        salvarToken(resultado.token);
      }

      navigate(returnUrlRef.current || '/', { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao autenticar');
    } finally {
      setCarregando(false);
    }
  }

  if (ehFluxoMcp) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(95,198,213,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(116,132,154,0.15),_transparent_24%),linear-gradient(180deg,_#04070c_0%,_#061019_42%,_#03060a_100%)] px-4 py-8 text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-25" />

        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
          <section className="vault-panel vault-grid relative w-full overflow-hidden rounded-[30px] border border-white/8 p-6 shadow-[0_26px_90px_rgba(0,0,0,0.38)] md:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(95,198,213,0.14),_transparent_70%)]" />

            <div className="relative space-y-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-400/8 text-cyan-100">
                <LockKeyhole size={24} />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-slate-500">
                  Conectar MCP
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white">
                  Faça login para autorizar
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Sua conta será vinculada ao servidor MCP local para sincronizar o vault.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="relative mt-8 space-y-5">
              {modo === 'registro' && (
                <CampoRotulo
                  label="Nome"
                  input={(
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="vault-input"
                      required
                    />
                  )}
                />
              )}

              <CampoRotulo
                label="Email"
                input={(
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="vault-input"
                    required
                  />
                )}
              />

              <CampoRotulo
                label="Senha"
                input={(
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="vault-input"
                    minLength={8}
                    required
                  />
                )}
              />

              {erro && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={carregando}
                className="w-full rounded-2xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-3.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {carregando ? 'Aguarde...' : modo === 'login' ? 'Entrar e conectar MCP' : 'Criar conta e conectar MCP'}
              </button>

              <p className="text-center text-sm text-slate-500">
                {modo === 'login' ? 'Ainda não tem conta?' : 'Já possui conta?'}{' '}
                <button
                  type="button"
                  onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}
                  className="font-medium text-cyan-200 transition hover:text-white"
                >
                  {modo === 'login' ? 'Criar agora' : 'Fazer login'}
                </button>
              </p>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(95,198,213,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(116,132,154,0.15),_transparent_24%),linear-gradient(180deg,_#04070c_0%,_#061019_42%,_#03060a_100%)] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-25" />

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="px-2 lg:px-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/18 bg-cyan-300/8 px-4 py-2 text-xs uppercase tracking-[0.26em] text-cyan-100/85">
            <ShieldCheck size={14} />
            Vault seguro para contexto agentic
          </div>

          <img src={brand.logoSidebar} alt={brand.appName} className="mt-7 h-16 w-auto max-w-full object-contain" />

          <h1 className="mt-8 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Centralize skills, instruções e sync local-first sem espalhar contexto por máquina.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400 md:text-lg">
            {brand.appName} organiza seu vault pessoal com web, API, CLI e MCP em uma superfície única.
            O fluxo oficial continua simples: pull, trabalho local, push.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <PainelInfo titulo="Vault versionado" valor="skills, agentes, memória e snippets" />
            <PainelInfo titulo="MCP pronto" valor="Codex, Claude, Cursor e clientes compatíveis" />
            <PainelInfo titulo="Conta única" valor="API key reutilizável em qualquer dispositivo" />
          </div>

          <div className="vault-panel mt-8 max-w-3xl rounded-[28px] border border-white/8 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Instalação do MCP</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Conecte o MyInst ao seu cliente em poucos minutos</h2>
              </div>
              <span className="rounded-full border border-cyan-300/18 bg-cyan-300/8 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-100/85">
                npm global
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <BlocoCodigo
                titulo="1. Instale o servidor MCP"
                codigo={`npm install -g @myinst/mcp-server`}
              />

              <BlocoCodigo
                titulo="2. Configure no cliente MCP"
                codigo={`{\n  "mcpServers": {\n    "myinst": {\n      "command": "myinst-mcp",\n      "env": {\n        "MYINST_API_KEY": "{{MYINST_API_KEY}}",\n        "MYINST_SERVER": "https://api-myinst.lotoscore.com.br"\n      }\n    }\n  }\n}`}
              />

              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-6 text-cyan-100">
                Use placeholders em exemplos e exemplos de documento. Nunca cole chaves ou segredos reais no arquivo de onboarding.
              </div>
            </div>

            <p className="mt-4 text-sm leading-7 text-slate-400">
              Depois do login, gere sua API key na área da conta e use o fluxo padrão do vault:
              {' '}<span className="text-slate-200">pull, trabalho local, push</span>.
            </p>
          </div>
        </section>

        <section className="vault-panel vault-grid relative overflow-hidden rounded-[30px] border border-white/8 p-6 shadow-[0_26px_90px_rgba(0,0,0,0.38)] md:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(95,198,213,0.14),_transparent_70%)]" />

          <form onSubmit={handleSubmit} className="relative space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Acesso ao Vault</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {modo === 'login' ? 'Entrar na conta' : 'Criar nova conta'}
                </h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/16 bg-cyan-400/8 text-cyan-100">
                <LockKeyhole size={20} />
              </div>
            </div>

            {modo === 'registro' && (
              <CampoRotulo
                label="Nome"
                input={(
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="vault-input"
                    required
                  />
                )}
              />
            )}

            <CampoRotulo
              label="Email"
              input={(
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="vault-input"
                  required
                />
              )}
            />

            <CampoRotulo
              label="Senha"
              input={(
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="vault-input"
                  minLength={8}
                  required
                />
              )}
            />

            {erro && (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full rounded-2xl border border-cyan-300/24 bg-cyan-300/14 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {carregando ? 'Processando...' : modo === 'login' ? 'Entrar no vault' : 'Criar conta e abrir vault'}
            </button>

            <p className="text-center text-sm text-slate-500">
              {modo === 'login' ? 'Ainda não tem conta?' : 'Já possui conta?'}{' '}
              <button
                type="button"
                onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}
                className="font-medium text-cyan-200 transition hover:text-white"
              >
                {modo === 'login' ? 'Criar agora' : 'Fazer login'}
              </button>
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}

function PainelInfo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{titulo}</p>
      <p className="mt-3 text-sm leading-6 text-slate-200">{valor}</p>
    </div>
  );
}

function CampoRotulo({ label, input }: { label: string; input: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-400">{label}</span>
      {input}
    </label>
  );
}

function BlocoCodigo({ titulo, codigo }: { titulo: string; codigo: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-[#050c14]/90 p-4">
      <p className="text-sm font-medium text-slate-200">{titulo}</p>
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/6 bg-slate-950/80 p-4 text-xs leading-6 text-cyan-100">
        <code>{codigo}</code>
      </pre>
    </div>
  );
}
