import { describe, expect, it } from 'vitest';
import { montarPreviewPull } from '../src/pull-preview.js';

describe('Pull preview', () => {
  it('inclui o guia operacional MYINST.md no dry run', () => {
    const texto = montarPreviewPull([{
      type: 'skill',
      title: 'TDD',
      slug: 'tdd',
      tags: [],
    }]);

    expect(texto).toContain('[DRY RUN] 2 item(ns) seriam aplicados');
    expect(texto).toContain('.claude/MYINST.md');
    expect(texto).toContain('Regras de segurança');
    expect(texto).toContain('placeholders');
    expect(texto).toContain('"slug": "myinst"');
    expect(texto).toContain('"slug": "tdd"');
  });
});
