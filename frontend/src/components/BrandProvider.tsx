import { createContext, useContext, useEffect, useState } from 'react';
import { aplicarBrandNoDocumento, carregarBrand, type BrandManifest } from '@/lib/brand';

const BRAND_FALLBACK: BrandManifest = {
  appName: 'MyInst',
  tagline: 'Vault seguro para contexto agentic',
  logoSidebar: '/brand.default/logo-sidebar.svg',
  logoMark: '/brand.default/logo-mark.svg',
  favicon: '/brand.default/favicon.svg',
};

const BrandContext = createContext<BrandManifest>(BRAND_FALLBACK);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandManifest>(BRAND_FALLBACK);

  useEffect(() => {
    carregarBrand().then((manifest) => {
      setBrand(manifest);
      aplicarBrandNoDocumento(manifest);
    });
  }, []);

  return (
    <BrandContext.Provider value={brand}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
