export interface BrandManifest {
  appName: string;
  tagline: string;
  logoSidebar: string;
  logoMark: string;
  favicon: string;
}

const MANIFEST_PADRAO: BrandManifest = {
  appName: 'MyInst',
  tagline: 'Vault seguro para contexto agentic',
  logoSidebar: '/brand.default/logo-sidebar.svg',
  logoMark: '/brand.default/logo-mark.svg',
  favicon: '/brand.default/favicon.svg',
};

export async function carregarBrand(): Promise<BrandManifest> {
  const manifestLocal = await tentarCarregar('/brand.local/manifest.json');
  if (manifestLocal) {
    return normalizarManifest(manifestLocal);
  }

  const manifestPadrao = await tentarCarregar('/brand.default/manifest.json');
  if (manifestPadrao) {
    return normalizarManifest(manifestPadrao);
  }

  return MANIFEST_PADRAO;
}

export function aplicarBrandNoDocumento(brand: BrandManifest) {
  document.title = brand.appName;

  const linkExistente = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (linkExistente) {
    linkExistente.href = brand.favicon;
    return;
  }

  const novoLink = document.createElement('link');
  novoLink.rel = 'icon';
  novoLink.href = brand.favicon;
  document.head.appendChild(novoLink);
}

async function tentarCarregar(path: string): Promise<Partial<BrandManifest> | null> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function normalizarManifest(manifest: Partial<BrandManifest>): BrandManifest {
  return {
    appName: manifest.appName?.trim() || MANIFEST_PADRAO.appName,
    tagline: manifest.tagline?.trim() || MANIFEST_PADRAO.tagline,
    logoSidebar: manifest.logoSidebar?.trim() || MANIFEST_PADRAO.logoSidebar,
    logoMark: manifest.logoMark?.trim() || MANIFEST_PADRAO.logoMark,
    favicon: manifest.favicon?.trim() || MANIFEST_PADRAO.favicon,
  };
}
