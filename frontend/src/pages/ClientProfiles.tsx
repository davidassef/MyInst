import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ShieldCheck, Waypoints } from 'lucide-react';
import { useContextMenuRegistry } from '@/components/ContextMenuRegistry';
import { ReplicationModal } from '@/components/ReplicationModal';
import { api } from '@/lib/api';
import { possuiReplicacaoCompativel } from '@/lib/clientProfileReplication';

interface ClientProfile {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description: string | null;
  itemCount: number;
  isConfigured: boolean;
}

export function ClientProfilesPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ClientProfile[]>([]);
  const [clientReplicacao, setClientReplicacao] = useState<string | null>(null);

  useEffect(() => {
    api.clientProfiles.listar().then(setProfiles);
  }, []);

  useContextMenuRegistry(
    {
      getPageActions: () => [],
      getCardActions: ({ kind, id }) => {
        if (kind !== 'client-profile-card') return [];
        if (!possuiReplicacaoCompativel(id)) return [];

        return [
          {
            label: 'Replicar',
            onSelect: () => setClientReplicacao(id),
          },
        ];
      },
    },
    [profiles],
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.75fr]">
        <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Client Profiles</p>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Configurações globais por cliente, fora de workspaces e projetos.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 md:text-base">
            Use esta área para instruções, skills e MCP configs que devem valer para toda a conta, independente do workspace ativo.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/8 bg-slate-950/45 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/8">
              <ShieldCheck size={18} className="text-cyan-100" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Escopo global</p>
              <p className="mt-1 text-sm text-slate-200">{profiles.length} cliente(s) disponíveis</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-slate-400">
            Esse conteúdo não deve aparecer como projeto. Ele é sincronizado por cliente e reutilizado em qualquer dispositivo.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {profiles.map((profile) => (
          <article key={profile.clientId} className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/14 hover:bg-white/[0.05]">
            <div
              data-context-menu="client-profile-card"
              data-context-id={profile.clientId}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/client-profiles/${profile.clientId}`)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                navigate(`/client-profiles/${profile.clientId}`);
              }}
              className="flex h-full cursor-pointer flex-col"
            >
              <div className="group min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/14 bg-cyan-400/8">
                    <Waypoints size={18} className="text-cyan-100" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-white transition group-hover:text-cyan-200">
                      {profile.name}
                    </h2>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{profile.clientId}</p>
                  </div>
                </div>
              </div>

              <p className="mt-5 flex-1 text-sm leading-7 text-slate-400">
                {profile.description || 'Configurações globais disponíveis para sincronização fora do escopo de projeto.'}
              </p>

              <div className="mt-5 flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${
                  profile.isConfigured
                    ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
                    : 'border-white/10 bg-white/[0.04] text-slate-500'
                }`}>
                  {profile.itemCount} item(ns)
                </span>
                <span className="text-xs text-slate-500">
                  {profile.isConfigured ? 'Sincronizado' : 'Ainda não sincronizado'}
                </span>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/8 pt-4">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Abrir profile</span>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-cyan-200 transition group-hover:text-white">
                  Entrar
                  <ChevronRight size={16} />
                </span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <ReplicationModal
        open={!!clientReplicacao}
        sourceClient={clientReplicacao ?? ''}
        onClose={() => setClientReplicacao(null)}
      />
    </div>
  );
}
