import type { ContentType, ResumoReplicacaoClientProfile, ResumoReplicacaoClientProfileItem } from '@myinst/shared';

type EstadoCompatibilidade = 'supported' | 'planned' | 'not_supported_v1';
type MotivoIgnorado = 'incompatible' | 'no_rule' | 'already_exists';

interface ItemReplicavel {
  type: ContentType;
  slug: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  tags: string[];
}

interface RegraCompatibilidadePar {
  sourceClient: string;
  targetClient: string;
  status: EstadoCompatibilidade;
  transformadores: Partial<Record<ContentType, (item: ItemReplicavel) => ItemReplicavel>>;
  ignoredTypeReasons: Partial<Record<ContentType, Exclude<MotivoIgnorado, 'already_exists'>>>;
  targetSupportedTypes: ContentType[];
}

interface PlanoReplicacaoClientProfile extends ResumoReplicacaoClientProfile {
  toCreateItems: ItemReplicavel[];
  toUpdateItems: ItemReplicavel[];
}

export function listarParesSuportadosReplicacaoClientProfile() {
  return MATRIZ_COMPATIBILIDADE
    .filter((regra) => regra.status === 'supported')
    .map((regra) => `${regra.sourceClient}->${regra.targetClient}`);
}

export function listarDestinosCompativeisClientProfile(sourceClient: string) {
  const sourceClientNormalizado = sourceClient.toLowerCase();

  return MATRIZ_COMPATIBILIDADE
    .filter((regra) => regra.sourceClient === sourceClientNormalizado && regra.status === 'supported')
    .map((regra) => regra.targetClient);
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
  sourceItems: ItemReplicavel[];
  targetItems: ItemReplicavel[];
  types?: ContentType[];
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
  const compatible: ResumoReplicacaoClientProfileItem[] = [];
  const toCreateItems: ItemReplicavel[] = [];
  const toUpdateItems: ItemReplicavel[] = [];
  const skippedExisting: ResumoReplicacaoClientProfileItem[] = [];
  const ignoredIncompatible: ResumoReplicacaoClientProfileItem[] = [];
  const ignoredNoRule: ResumoReplicacaoClientProfileItem[] = [];

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
        toUpdateItems.push(transformado);
        continue;
      }

      skippedExisting.push(criarResumoItem(transformado, 'item já existe no client de destino'));
      continue;
    }

    toCreateItems.push(transformado);
  }

  return {
    sourceClient: sourceClientNormalizado,
    targetClient: targetClientNormalizado,
    pair: `${sourceClientNormalizado}->${targetClientNormalizado}`,
    compatible,
    toCreate: toCreateItems.map((item) => criarResumoItem(item)),
    toUpdate: toUpdateItems.map((item) => criarResumoItem(item)),
    skippedExisting,
    ignoredIncompatible,
    ignoredNoRule,
    toCreateItems,
    toUpdateItems,
  };
}

function obterRegraCompatibilidade(sourceClient: string, targetClient: string) {
  return MATRIZ_COMPATIBILIDADE.find((regra) => regra.sourceClient === sourceClient && regra.targetClient === targetClient) ?? null;
}

function chaveItem(type: string, slug: string) {
  return `${type}:${slug}`;
}

function criarResumoItem(item: ItemReplicavel, reason?: string): ResumoReplicacaoClientProfileItem {
  return {
    type: item.type,
    slug: item.slug,
    title: item.title,
    ...(reason ? { reason } : {}),
  };
}

function registrarIgnorado(
  item: ItemReplicavel,
  motivo: Exclude<MotivoIgnorado, 'already_exists'>,
  ignoredIncompatible: ResumoReplicacaoClientProfileItem[],
  ignoredNoRule: ResumoReplicacaoClientProfileItem[],
) {
  if (motivo === 'no_rule') {
    ignoredNoRule.push(criarResumoItem(item, 'sem regra de transformação no v1'));
    return;
  }

  ignoredIncompatible.push(criarResumoItem(item, 'tipo incompatível com o client de destino no v1'));
}

function clonarComoReplicado(sourceClient: string, item: ItemReplicavel): ItemReplicavel {
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
    targetSupportedTypes: ['instruction'],
    transformadores: {
      instruction: (item) => clonarComoReplicado('claude', item),
    },
    ignoredTypeReasons: {
      skill: 'no_rule',
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
    targetSupportedTypes: ['instruction'],
    transformadores: {
      instruction: (item) => clonarComoReplicado('codex', item),
    },
    ignoredTypeReasons: {
      skill: 'no_rule',
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
  {
    sourceClient: 'claude',
    targetClient: 'codex',
    status: 'planned',
    targetSupportedTypes: [],
    transformadores: {},
    ignoredTypeReasons: {},
  },
  {
    sourceClient: 'codex',
    targetClient: 'claude',
    status: 'planned',
    targetSupportedTypes: [],
    transformadores: {},
    ignoredTypeReasons: {},
  },
  {
    sourceClient: 'opencode',
    targetClient: 'claude',
    status: 'planned',
    targetSupportedTypes: [],
    transformadores: {},
    ignoredTypeReasons: {},
  },
  {
    sourceClient: 'opencode',
    targetClient: 'codex',
    status: 'planned',
    targetSupportedTypes: [],
    transformadores: {},
    ignoredTypeReasons: {},
  },
];
