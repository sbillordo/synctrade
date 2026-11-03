import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { CHART_HTML, type ChartPayload } from '@/lib/chartHtml';
import { load, save } from '@/lib/storage';

type ChartWindow = Window & { render?: (p: ChartPayload) => void };

const MIN = 320, MAX = 1400;

/** On web the chart height is the user's: drag the bar under it. Saved on this device. */
export function SetupChart({ payload, height }: { payload: ChartPayload; height: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState<number>(() => load('chartHeight', height));
  const [dragging, setDragging] = useState(false);
  const draw = () => (ref.current?.contentWindow as ChartWindow | null)?.render?.(payload);

  useEffect(draw, [payload]);

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = h;
    let last = h0;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      last = Math.round(Math.min(MAX, Math.max(MIN, h0 + ev.clientY - y0)));
      setH(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      save('chartHeight', last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <View style={{ backgroundColor: payload.colors.surface }}>
      <View style={{ height: h, overflow: 'hidden' }}>
        {/* while resizing the iframe must not swallow the pointer */}
        <iframe ref={ref} srcDoc={CHART_HTML} onLoad={draw} title="Chart"
          style={{ border: 0, width: '100%', height: '100%', pointerEvents: dragging ? 'none' : 'auto' }} />
      </View>
      <div
        onPointerDown={start}
        onDoubleClick={() => { setH(height); save('chartHeight', height); }}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize chart"
        title="Drag to resize · double-click to reset"
        style={{ height: 12, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}>
        <div style={{ width: 44, height: 4, borderRadius: 2, background: dragging ? payload.colors.accent : payload.colors.hairlineStrong }} />
      </div>
    </View>
  );
}
