import { describe, expect, it } from 'vitest';
import { listarDestinosCompativeis, montarResumoVisualReplicacao, possuiReplicacaoCompativel } from './clientProfileReplication';

describe('clientProfileReplication', () => {
  it('lista destinos compatíveis suportados no v1', () => {
    expect(listarDestinosCompativeis('claude')).toEqual(['opencode']);
    expect(listarDestinosCompativeis('codex')).toEqual(['opencode']);
    expect(listarDestinosCompativeis('cursor')).toEqual([]);
  });

  it('indica se um client possui replicação compatível', () => {
    expect(possuiReplicacaoCompativel('claude')).toBe(true);
    expect(possuiReplicacaoCompativel('codex')).toBe(true);
    expect(possuiReplicacaoCompativel('gemini')).toBe(false);
  });

  it('monta resumo visual com as contagens esperadas', () => {
    const linhas = montarResumoVisualReplicacao({
      sourceClient: 'claude',
      targetClient: 'opencode',
      pair: 'claude->opencode',
      compatible: [{ type: 'instruction', slug: 'claude-base', title: 'Claude Base' }],
      toCreate: [{ type: 'instruction', slug: 'claude-base', title: 'Claude Base' }],
      toUpdate: [],
      skippedExisting: [],
      ignoredIncompatible: [{ type: 'command', slug: 'commit-global', title: 'Commit Global' }],
      ignoredNoRule: [],
    });

    expect(linhas).toContain('Compatíveis: 1');
    expect(linhas).toContain('Criar: 1');
    expect(linhas).toContain('Ignorados por incompatibilidade: 1');
  });
});
