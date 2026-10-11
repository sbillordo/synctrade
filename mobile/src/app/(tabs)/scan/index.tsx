import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Chip, Icon, Row, Section, T } from '@/components/ui';
import { api, getServerUrl, TIMEFRAMES, type Scan, type TF } from '@/lib/api';
import { useAppState } from '@/lib/store';
import { radius, type, useColors } from '@/lib/theme';

const ny = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, ...opts });

export default function ScanScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { setUniverse } = useAppState();
  const server = !!getServerUrl();
  const universes = useQuery({ queryKey: ['universes'], queryFn: api.universes, enabled: server });
  const status = useQuery({ queryKey: ['status'], queryFn: api.status, enabled: server });
  const recent = useQuery({ queryKey: ['scans'], queryFn: () => api.scans(5), enabled: server });
  const [ticker, setTicker] = useState('');
  const [uni, setUni] = useState('nasdaq100');
  const [tfs, setTfs] = useState<TF[]>(['1h', '4h', '1d']);
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);

  // poll the running scan once a second until it finishes
  useEffect(() => {
    if (!scan || scan.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const s = await api.scan(scan.id);
        setScan(s);
        if (s.status !== 'running') {
          qc.invalidateQueries({ queryKey: ['results'] });
          qc.invalidateQueries({ queryKey: ['scans'] });
          qc.invalidateQueries({ queryKey: ['status'] });
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [scan, qc]);

  const run = async () => {
    setError(null);
    try {
      setScan(await api.startScan({ universe: uni, tfs }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const analyze = () => {
    const t = ticker.trim().toUpperCase();
    if (t) router.push({ pathname: '/ticker/[symbol]', params: { symbol: t } });
  };
  const running = scan?.status === 'running';

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Section title="Analyze one ticker">
        <Row first>
          <TextInput
            value={ticker}
            onChangeText={setTicker}
            placeholder="Ticker, e.g. NVDA"
            placeholderTextColor={c.ink3}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={analyze}
            accessibilityLabel="Ticker"
            style={[type.body, styles.input, { color: c.ink, backgroundColor: c.surfaceRaised }]}
          />
          <Pressable onPress={analyze} accessibilityRole="button" style={[styles.go, { backgroundColor: c.accent }]}>
            <T kind="headline" color={c.accentInk}>Analyze</T>
          </Pressable>
        </Row>
      </Section>

      <Section title="Scan a universe">
        {(universes.data ?? []).map((u, i) => (
          <Pressable key={u.id} onPress={() => setUni(u.id)} accessibilityRole="radio" accessibilityState={{ checked: uni === u.id }}>
            <Row first={i === 0}>
              <View style={{ flex: 1 }}>
                <T kind="body" color={uni === u.id ? c.accent : c.ink} style={{ fontWeight: '600' }}>{u.label}</T>
                <T kind="footnote" color={c.ink2}>{u.count ? `${u.count} tickers` : 'List downloads on the first scan'}</T>
              </View>
              {uni === u.id && <Icon sf="checkmark" web="check" size={16} color={c.accent} />}
            </Row>
          </Pressable>
        ))}
        <Row style={{ gap: 8 }}>
          {TIMEFRAMES.map((t) => (
            <Chip key={t} label={t} on={tfs.includes(t)} onPress={() => setTfs(tfs.includes(t) ? (tfs.length > 1 ? tfs.filter((x) => x !== t) : tfs) : [...tfs, t])} />
          ))}
        </Row>
        <Row style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <Button label={running ? 'Scanning…' : 'Run scan'} onPress={run} disabled={running || !server} />
          {scan && (
            <View style={{ gap: 6 }}>
              <View style={[styles.bar, { backgroundColor: c.surfaceHigh }]}>
                <View style={[styles.barFill, { width: `${Math.round(scan.progress * 100)}%`, backgroundColor: scan.status === 'error' ? c.down : c.accent }]} />
              </View>
              <View style={styles.stage}>
                <T kind="footnote" color={c.ink2}>
                  {scan.status === 'running' ? scan.stage ?? 'Starting' : scan.status === 'done' ? `Done · ${scan.n_results} results · ${scan.n_new_signals} new` : `Failed: ${scan.error}`}
                </T>
                <T kind="footnote" tabular color={c.ink2}>{Math.round(scan.progress * 100)}%</T>
              </View>
              {scan.status === 'done' && (
                <Pressable onPress={() => { setUniverse(scan.universe); router.navigate('/setups'); }} hitSlop={8}>
                  <T kind="subhead" color={c.accent}>Show setups</T>
                </Pressable>
              )}
            </View>
          )}
          {error && <T kind="footnote" color={c.down}>{error}</T>}
        </Row>
      </Section>

      <Section title="Next automatic scans" aside="NY time">
        {(status.data?.scheduler ?? []).filter((j) => j.next).slice(0, 6).map((j, i) => (
          <Row key={j.id} first={i === 0}>
            <T kind="body" tabular style={{ width: 120 }}>{ny(j.next!, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</T>
            <T kind="footnote" color={c.ink2} style={{ flex: 1 }}>{j.name.replace('scan ', '').replace(/\+/g, ' ')}</T>
          </Row>
        ))}
        {!status.data?.scheduler.length && <Row first><T kind="footnote" color={c.ink2}>The schedule shows here once the server is connected.</T></Row>}
      </Section>

      <Section title="Recent scans">
        {(recent.data ?? []).map((s, i) => (
          <Row key={s.id} first={i === 0}>
            <T kind="footnote" tabular color={c.ink2} style={{ width: 96 }}>{ny(s.started_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</T>
            <T kind="footnote" style={{ flex: 1 }}>{s.universe} · {s.n_results} results</T>
            <T kind="footnote" tabular color={s.n_new_signals ? c.accent : c.ink2}>{s.status === 'error' ? 'failed' : `${s.n_new_signals} new`}</T>
          </Row>
        ))}
        {!recent.data?.length && <Row first><T kind="footnote" color={c.ink2}>No scans yet.</T></Row>}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 20, paddingBottom: 40 },
  input: { flex: 1, minHeight: 44, borderRadius: radius.sm, paddingHorizontal: 12 },
  go: { minHeight: 44, borderRadius: radius.sm, paddingHorizontal: 16, justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%' },
  stage: { flexDirection: 'row', justifyContent: 'space-between' },
});
