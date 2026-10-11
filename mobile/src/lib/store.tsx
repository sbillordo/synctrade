// App-wide state: list filters (persisted) and the order of the list the detail page pages through.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { TF } from './api';
import { DEFAULT_FILTERS, type Filters } from './conditions';
import { load, save } from './storage';

type Ctx = {
  filters: Filters;
  setFilters: (f: Filters) => void;
  universe: string;
  setUniverse: (u: string) => void;
  sequence: { ticker: string; tf: TF }[];
  setSequence: (s: { ticker: string; tf: TF }[]) => void;
};

const AppState = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [filters, setF] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, ...load('filters', DEFAULT_FILTERS) }));
  const [universe, setU] = useState<string>(() => load('universe', 'nasdaq100'));
  const [sequence, setSequence] = useState<{ ticker: string; tf: TF }[]>([]);
  const value = useMemo<Ctx>(
    () => ({
      filters,
      setFilters: (f) => {
        setF(f);
        save('filters', f);
      },
      universe,
      setUniverse: (u) => {
        setU(u);
        save('universe', u);
      },
      sequence,
      setSequence,
    }),
    [filters, universe, sequence],
  );
  return <AppState.Provider value={value}>{children}</AppState.Provider>;
}

export function useAppState() {
  const v = useContext(AppState);
  if (!v) throw new Error('useAppState outside AppStateProvider');
  return v;
}
