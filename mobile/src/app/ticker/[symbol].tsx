import { useLocalSearchParams } from 'expo-router';

import { TickerDetail } from '@/components/ticker-detail';
import type { TF } from '@/lib/api';

export default function TickerScreen() {
  const { symbol, tf } = useLocalSearchParams<{ symbol: string; tf?: TF }>();
  return <TickerDetail ticker={String(symbol).toUpperCase()} tfParam={tf} />;
}
