import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { CHART_HTML, type ChartPayload } from '@/lib/chartHtml';

export function SetupChart({ payload, height }: { payload: ChartPayload; height: number }) {
  const ref = useRef<WebView>(null);
  const loaded = useRef(false);
  const json = JSON.stringify(payload);

  useEffect(() => {
    if (loaded.current) ref.current?.injectJavaScript(`window.render(${json}); true;`);
  }, [json]);

  return (
    <View style={[styles.box, { height, backgroundColor: payload.colors.surface }]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: CHART_HTML }}
        style={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        bounces={false}
        onLoadEnd={() => {
          loaded.current = true;
          ref.current?.injectJavaScript(`window.render(${json}); true;`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: 'hidden' } });
