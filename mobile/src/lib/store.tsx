// App-wide state: list filters and broker costs (persisted) and the order of the list the detail page pages through.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { TF } from './api';
import { DEFAULT_FILTERS, type Filters } from './conditions';
import { DEFAULT_COSTS, type Costs } from './costs';
import { load, save } from './storage';

type Ctx = {
  filters: Filters;
  setFilters: (f: Filters) => void;
  costs: Costs;
  setCosts: (c: Costs) => void;
  universe: string;
  setUniverse: (u: string) => void;
  sequence: { ticker: string; tf: TF }[];
  setSequence: (s: { ticker: string; tf: TF }[]) => void;
};

const AppState = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [filters, setF] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, ...load('filters', DEFAULT_FILTERS) }));
  const [costs, setC] = useState<Costs>(() => ({ ...DEFAULT_COSTS, ...load('costsV2', DEFAULT_COSTS) }));
  const [universe, setU] = useState<string>(() => load('universeV2', 'all'));
  const [sequence, setSequence] = useState<{ ticker: string; tf: TF }[]>([]);
  const value = useMemo<Ctx>(
    () => ({
      filters,
      setFilters: (f) => {
        setF(f);
        save('filters', f);
      },
      costs,
      setCosts: (c) => {
        setC(c);
        save('costsV2', c);
      },
      universe,
      setUniverse: (u) => {
        setU(u);
        save('universeV2', u);
      },
      sequence,
      setSequence,
    }),
    [filters, costs, universe, sequence],
  );
  return <AppState.Provider value={value}>{children}</AppState.Provider>;
}

export function useAppState() {
  const v = useContext(AppState);
  if (!v) throw new Error('useAppState outside AppStateProvider');
  return v;
}
