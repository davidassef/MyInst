export interface ResumoReplicacaoItem {
  type: string;
  slug: string;
  title: string;
  reason?: string;
}

export interface ResumoReplicacaoClientProfile {
  sourceClient: string;
  targetClient: string;
  pair: string;
  compatible: ResumoReplicacaoItem[];
  toCreate: ResumoReplicacaoItem[];
  toUpdate: ResumoReplicacaoItem[];
  skippedExisting: ResumoReplicacaoItem[];
  ignoredIncompatible: ResumoReplicacaoItem[];
  ignoredNoRule: ResumoReplicacaoItem[];
}

const MATRIZ_REPLICACAO: Record<string, string[]> = {
  claude: ['opencode'],
  codex: ['opencode'],
};

export function listarDestinosCompativeis(sourceClient: string) {
  return MATRIZ_REPLICACAO[sourceClient] ?? [];
}

export function possuiReplicacaoCompativel(sourceClient: string) {
  return listarDestinosCompativeis(sourceClient).length > 0;
}

export function montarResumoVisualReplicacao(plano: ResumoReplicacaoClientProfile) {
  return [
    `Compatíveis: ${plano.compatible.length}`,
    `Criar: ${plano.toCreate.length}`,
    `Atualizar: ${plano.toUpdate.length}`,
    `Já existentes: ${plano.skippedExisting.length}`,
    `Ignorados por incompatibilidade: ${plano.ignoredIncompatible.length}`,
    `Ignorados por falta de regra: ${plano.ignoredNoRule.length}`,
  ];
}
