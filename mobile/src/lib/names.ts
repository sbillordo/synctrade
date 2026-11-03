import { useQuery } from '@tanstack/react-query';

import { api, getServerUrl } from './api';

/** Company names for a set of tickers (cached on the server, so only new tickers cost a lookup). */
export function useNames(tickers: string[]): Record<string, string> {
  const key = [...new Set(tickers)].sort();
  const q = useQuery({
    queryKey: ['names', key.join(',')],
    queryFn: () => api.names(key),
    enabled: key.length > 0 && !!getServerUrl(),
    staleTime: 24 * 3600_000,
    placeholderData: (prev) => prev,
  });
  return q.data ?? {};
}
