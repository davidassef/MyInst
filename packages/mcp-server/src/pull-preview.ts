interface PreviewItem {
  type: string;
  title: string;
  slug: string;
  tags: string[];
}

export function montarPreviewPull(items: PreviewItem[]): string {
  const preview = [
    {
      type: 'instruction',
      title: 'MyInst MCP',
      slug: 'myinst',
      path: '.myinst/MYINST.md',
      tags: [],
    },
    {
      type: 'instruction',
      title: 'MyInst MCP (Compatibilidade)',
      slug: 'myinst-legacy',
      path: '.claude/MYINST.md',
      tags: ['compatibilidade'],
    },
    ...items.map((item) => ({
      type: item.type,
      title: item.title,
      slug: item.slug,
      tags: item.tags,
    })),
  ];

  return `[DRY RUN] ${preview.length} item(ns) seriam aplicados, incluindo o guia operacional em .myinst/MYINST.md.\n`
    + 'Também existe cópia de compatibilidade em .claude/MYINST.md quando aplicável.\n'
    + 'Regras de segurança devem ser respeitadas antes do push (sem segredos em texto plano + placeholders).\n'
    + `Resumo:\n${JSON.stringify(preview, null, 2)}`;
}
