import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { CHART_HTML, type ChartPayload } from '@/lib/chartHtml';

type ChartWindow = Window & { render?: (p: ChartPayload) => void };

export function SetupChart({ payload, height }: { payload: ChartPayload; height: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const draw = () => (ref.current?.contentWindow as ChartWindow | null)?.render?.(payload);

  useEffect(draw, [payload]);

  return (
    <View style={{ height, backgroundColor: payload.colors.surface, overflow: 'hidden' }}>
      <iframe ref={ref} srcDoc={CHART_HTML} onLoad={draw} title="Chart" style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
