import { createContext, useContext, useEffect } from 'react';
import type { ContextMenuAction } from '@/components/ContextMenu';

export interface CardContextDescriptor {
  kind: string;
  id: string;
}

export interface ContextMenuDefinition {
  getPageActions?: () => ContextMenuAction[];
  getCardActions?: (card: CardContextDescriptor) => ContextMenuAction[];
}

const context = createContext<((definition: ContextMenuDefinition) => void) | null>(null);

export function ContextMenuRegistryProvider({
  children,
  setDefinition,
}: {
  children: React.ReactNode;
  setDefinition: (definition: ContextMenuDefinition) => void;
}) {
  return <context.Provider value={setDefinition}>{children}</context.Provider>;
}

export function useContextMenuRegistry(definition: ContextMenuDefinition, deps: React.DependencyList) {
  const setDefinition = useContext(context);

  useEffect(() => {
    if (!setDefinition) return;
    setDefinition(definition);

    return () => {
      setDefinition({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
