import type { ItemSincronizavel, TipoSincronizavel } from './sync-targets/index.js';

type EstadoCompatibilidade = 'supported' | 'planned' | 'not_supported_v1';
type MotivoIgnorado = 'incompatible' | 'no_rule' | 'already_exists';

interface RegraCompatibilidadePar {
  sourceClient: string;
  targetClient: string;
  status: EstadoCompatibilidade;
  allowedSourceTypes: TipoSincronizavel[];
  targetSupportedTypes: TipoSincronizavel[];
  transformadores: Partial<Record<TipoSincronizavel, (item: ItemSincronizavel) => ItemSincronizavel>>;
  ignoredTypeReasons: Partial<Record<TipoSincronizavel, Exclude<MotivoIgnorado, 'already_exists'>>>;
}

interface ItemPlanejado {
  type: TipoSincronizavel;
  slug: string;
  title: string;
  reason?: string;
}

export interface PlanoReplicacaoClientProfile {
  sourceClient: string;
  targetClient: string;
  status: EstadoCompatibilidade;
  pair: string;
  compatible: ItemPlanejado[];
  toCreate: ItemSincronizavel[];
  toUpdate: ItemSincronizavel[];
  skippedExisting: ItemPlanejado[];
  ignoredIncompatible: ItemPlanejado[];
  ignoredNoRule: ItemPlanejado[];
}

export function listarMatrizCompatibilidadeReplicacao() {
  return [
    { sourceClient: 'claude', targetClient: 'opencode', status: 'supported' as const },
    { sourceClient: 'codex', targetClient: 'opencode', status: 'supported' as const },
    { sourceClient: 'claude', targetClient: 'codex', status: 'planned' as const },
    { sourceClient: 'codex', targetClient: 'claude', status: 'planned' as const },
    { sourceClient: 'opencode', targetClient: 'claude', status: 'planned' as const },
    { sourceClient: 'opencode', targetClient: 'codex', status: 'planned' as const },
    { sourceClient: 'cursor', targetClient: 'opencode', status: 'not_supported_v1' as const },
    { sourceClient: 'gemini', targetClient: 'opencode', status: 'not_supported_v1' as const },
    { sourceClient: 'qwen', targetClient: 'opencode', status: 'not_supported_v1' as const },
    { sourceClient: 'aider', targetClient: 'opencode', status: 'not_supported_v1' as const },
    { sourceClient: 'antigravity', targetClient: 'opencode', status: 'not_supported_v1' as const },
  ];
}

export function planejarReplicacaoClientProfile({
  sourceClient,
  targetClient,
  sourceItems,
  targetItems,
  types,
  overwrite = false,
}: {
  sourceClient: string;
  targetClient: string;
  sourceItems: ItemSincronizavel[];
  targetItems: ItemSincronizavel[];
  types?: string[];
  overwrite?: boolean;
}): PlanoReplicacaoClientProfile {
  const sourceClientNormalizado = sourceClient.toLowerCase();
  const targetClientNormalizado = targetClient.toLowerCase();
  const regra = obterRegraCompatibilidade(sourceClientNormalizado, targetClientNormalizado);

  if (!regra || regra.status !== 'supported') {
    throw new Error(`Replicação não suportada no v1 para ${sourceClientNormalizado} -> ${targetClientNormalizado}`);
  }

  const itensDestino = new Set(targetItems.map((item) => chaveItem(item.type, item.slug)));
  const chavesPlanejadas = new Set<string>();
  const compatible: ItemPlanejado[] = [];
  const toCreate: ItemSincronizavel[] = [];
  const toUpdate: ItemSincronizavel[] = [];
  const skippedExisting: ItemPlanejado[] = [];
  const ignoredIncompatible: ItemPlanejado[] = [];
  const ignoredNoRule: ItemPlanejado[] = [];

  for (const item of sourceItems) {
    if (types?.length && !types.includes(item.type)) {
      continue;
    }

    const transformador = regra.transformadores[item.type];
    if (!transformador) {
      registrarIgnorado(item, regra.ignoredTypeReasons[item.type] ?? 'incompatible', ignoredIncompatible, ignoredNoRule);
      continue;
    }

    const transformado = transformador(item);
    const chave = chaveItem(transformado.type, transformado.slug);

    if (!regra.targetSupportedTypes.includes(transformado.type)) {
      ignoredNoRule.push(criarResumoItem(transformado, 'tipo transformado sem suporte nativo no destino'));
      continue;
    }

    if (chavesPlanejadas.has(chave)) {
      ignoredNoRule.push(criarResumoItem(transformado, 'conflito de slug após transformação'));
      continue;
    }

    chavesPlanejadas.add(chave);
    compatible.push(criarResumoItem(transformado));

    if (itensDestino.has(chave)) {
      if (overwrite) {
        toUpdate.push(transformado);
        continue;
      }

      skippedExisting.push(criarResumoItem(transformado, 'item já existe no client de destino'));
      continue;
    }

    toCreate.push(transformado);
  }

  return {
    sourceClient,
    targetClient,
    status: regra.status,
    pair: `${sourceClientNormalizado}->${targetClientNormalizado}`,
    compatible,
    toCreate,
    toUpdate,
    skippedExisting,
    ignoredIncompatible,
    ignoredNoRule,
  };
}

function obterRegraCompatibilidade(sourceClient: string, targetClient: string) {
  return MATRIZ_COMPATIBILIDADE.find((regra) => regra.sourceClient === sourceClient && regra.targetClient === targetClient) ?? null;
}

function chaveItem(type: string, slug: string) {
  return `${type}:${slug}`;
}

function criarResumoItem(item: ItemSincronizavel, reason?: string): ItemPlanejado {
  return {
    type: item.type,
    slug: item.slug,
    title: item.title,
    ...(reason ? { reason } : {}),
  };
}

function registrarIgnorado(
  item: ItemSincronizavel,
  motivo: Exclude<MotivoIgnorado, 'already_exists'>,
  ignoredIncompatible: ItemPlanejado[],
  ignoredNoRule: ItemPlanejado[],
) {
  if (motivo === 'no_rule') {
    ignoredNoRule.push(criarResumoItem(item, 'sem regra de transformação no v1'));
    return;
  }

  ignoredIncompatible.push(criarResumoItem(item, 'tipo incompatível com o client de destino no v1'));
}

function clonarComoReplicado(sourceClient: string, item: ItemSincronizavel): ItemSincronizavel {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      myinstReplicatedFromClient: sourceClient,
      myinstReplicatedFromSlug: item.slug,
      myinstReplicationVersion: 'v1',
    },
  };
}

const MATRIZ_COMPATIBILIDADE: RegraCompatibilidadePar[] = [
  {
    sourceClient: 'claude',
    targetClient: 'opencode',
    status: 'supported',
    allowedSourceTypes: ['instruction', 'skill', 'agent', 'command', 'output_style', 'setting'],
    targetSupportedTypes: ['instruction', 'skill'],
    transformadores: {
      instruction: (item) => clonarComoReplicado('claude', item),
      skill: (item) => clonarComoReplicado('claude', item),
    },
    ignoredTypeReasons: {
      agent: 'incompatible',
      command: 'incompatible',
      output_style: 'incompatible',
      setting: 'incompatible',
      mcp_config: 'incompatible',
      hook: 'incompatible',
      memory: 'incompatible',
      snippet: 'incompatible',
    },
  },
  {
    sourceClient: 'codex',
    targetClient: 'opencode',
    status: 'supported',
    allowedSourceTypes: ['instruction', 'skill', 'setting'],
    targetSupportedTypes: ['instruction', 'skill'],
    transformadores: {
      instruction: (item) => clonarComoReplicado('codex', item),
      skill: (item) => clonarComoReplicado('codex', item),
    },
    ignoredTypeReasons: {
      setting: 'incompatible',
      mcp_config: 'incompatible',
      agent: 'incompatible',
      command: 'incompatible',
      hook: 'incompatible',
      memory: 'incompatible',
      output_style: 'incompatible',
      snippet: 'incompatible',
    },
  },
];
