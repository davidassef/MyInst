import { useEffect, useMemo, useState } from 'react';
import { Copy, Eye, RefreshCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import { listarDestinosCompativeis, montarResumoVisualReplicacao, type ResumoReplicacaoClientProfile } from '@/lib/clientProfileReplication';

interface ReplicationModalProps {
  open: boolean;
  sourceClient: string;
  onClose: () => void;
}

export function ReplicationModal({ open, sourceClient, onClose }: ReplicationModalProps) {
  const destinos = useMemo(() => listarDestinosCompativeis(sourceClient), [sourceClient]);
  const [targetClient, setTargetClient] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState<ResumoReplicacaoClientProfile | null>(null);

  useEffect(() => {
    if (!open) return;
    setTargetClient(destinos[0] ?? '');
    setOverwrite(false);
    setErro('');
    setResumo(null);
  }, [destinos, open]);

  if (!open) return null;

  async function executar(dryRun: boolean) {
    if (!targetClient) return;
    setCarregando(true);
    setErro('');

    try {
      const resultado = await api.clientProfiles.replicar(sourceClient, targetClient, {
        dryRun,
        overwrite,
      });

      setResumo(resultado);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao replicar client profile');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,15,23,0.96)_0%,rgba(5,10,15,0.98)_100%)] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Replicação entre clients</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {sourceClient} para outro client compatível
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              O v1 copia apenas itens globais compatíveis e preserva o destino por padrão.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 text-slate-400 transition hover:border-white/14 hover:text-white"
            aria-label="Fechar modal de replicação"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">Destino</label>
            <select
              value={targetClient}
              onChange={(e) => setTargetClient(e.target.value)}
              className="vault-input"
            >
              {destinos.map((destino) => (
                <option key={destino} value={destino}>
                  {destino}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-end">
            <span className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="h-4 w-4 accent-cyan-300"
              />
              Sobrescrever compatíveis
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!targetClient || carregando}
            onClick={() => void executar(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye size={16} />
            {carregando ? 'Carregando...' : 'Pré-visualizar'}
          </button>
          <button
            type="button"
            disabled={!targetClient || carregando}
            onClick={() => void executar(false)}
            className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/22 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy size={16} />
            Replicar
          </button>
        </div>

        {erro && (
          <div className="mt-4 rounded-2xl border border-red-400/18 bg-red-500/8 px-4 py-3 text-sm text-red-200">
            {erro}
          </div>
        )}

        {resumo && (
          <div className="mt-5 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <RefreshCcw size={15} className="text-cyan-100" />
              Resumo da replicação
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {montarResumoVisualReplicacao(resumo).map((linha) => (
                <div key={linha} className="rounded-2xl border border-white/7 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                  {linha}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
