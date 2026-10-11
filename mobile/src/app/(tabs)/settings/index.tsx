import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button, Chip, Icon, Row, Section, Segmented, T } from '@/components/ui';
import { api, getServerUrl, setServerUrl, type Params } from '@/lib/api';
import { fmt } from '@/lib/conditions';
import { disablePush, enablePush, pushEnabled } from '@/lib/notifications';
import { radius, type, useColors } from '@/lib/theme';

function Stepper({ label, hint, value, step, min, max, digits = 0, onChange }: {
  label: string; hint?: string; value: number; step: number; min: number; max: number; digits?: number; onChange: (v: number) => void;
}) {
  const c = useColors();
  const set = (d: number) => onChange(Math.min(max, Math.max(min, Math.round((value + d) * 1000) / 1000)));
  return (
    <Row>
      <View style={{ flex: 1 }}>
        <T kind="body">{label}</T>
        {hint ? <T kind="footnote" color={c.ink2}>{hint}</T> : null}
      </View>
      <View style={[styles.stepper, { backgroundColor: c.surfaceRaised }]}>
        <Pressable onPress={() => set(-step)} accessibilityLabel={`Lower ${label}`} style={styles.stepBtn}>
          <Icon sf="minus" web="remove" size={14} color={c.ink2} />
        </Pressable>
        <T kind="body" tabular style={{ minWidth: 44, textAlign: 'center', fontWeight: '600' }}>{fmt(value, digits)}</T>
        <Pressable onPress={() => set(step)} accessibilityLabel={`Raise ${label}`} style={styles.stepBtn}>
          <Icon sf="plus" web="add" size={14} color={c.ink2} />
        </Pressable>
      </View>
    </Row>
  );
}

export default function SettingsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [url, setUrl] = useState(getServerUrl());
  const [conn, setConn] = useState<string | null>(null);
  const [push, setPush] = useState(pushEnabled());
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const settings = useQuery({ queryKey: ['settings', url], queryFn: api.settings, enabled: !!getServerUrl() });
  const [p, setP] = useState<Params | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  if (settings.data && p === null) setP(settings.data.params);

  const testConnection = async () => {
    setServerUrl(url);
    setConn('Connecting…');
    try {
      const s = await api.status();
      setConn(`Connected · market ${s.market_open ? 'open' : 'closed'}`);
      qc.invalidateQueries();
    } catch (e) {
      setConn((e as Error).message);
    }
  };
  const togglePush = async (on: boolean) => {
    setPushMsg(null);
    if (on) {
      const err = await enablePush().catch((e: Error) => e.message);
      setPush(!err);
      setPushMsg(err ?? 'You will get a notification when a scan finds new 5 of 5 setups.');
    } else {
      await disablePush();
      setPush(false);
    }
  };
  const saveParams = async () => {
    if (!p) return;
    try {
      await api.saveSettings(p);
      setSaved('Saved. Applies from the next scan.');
    } catch (e) {
      setSaved((e as Error).message);
    }
  };
  const level = (l: number) => p && setP({ ...p, niveles: p.niveles.includes(l) ? (p.niveles.length > 1 ? p.niveles.filter((x) => x !== l) : p.niveles) : [...p.niveles, l].sort() });

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Section title="Server" aside="Your Tailscale address">
        <Row first>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://server.your-tailnet.ts.net"
            placeholderTextColor={c.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={testConnection}
            accessibilityLabel="Server address"
            style={[type.body, styles.input, { color: c.ink, backgroundColor: c.surfaceRaised }]}
          />
        </Row>
        <Row style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <Button label="Save and test" kind="plain" onPress={testConnection} />
          {conn && <T kind="footnote" color={conn.startsWith('Connected') ? c.up : c.ink2}>{conn}</T>}
        </Row>
      </Section>

      <Section title="Notifications">
        <Row first>
          <View style={{ flex: 1 }}>
            <T kind="body">New setups</T>
            <T kind="footnote" color={c.ink2}>One notification per scan with the new 5 of 5 setups</T>
          </View>
          <Switch value={push} onValueChange={togglePush} trackColor={{ true: c.accent }} />
        </Row>
        {push && (
          <Pressable onPress={() => api.pushTest().then(() => setPushMsg('Test sent.')).catch((e: Error) => setPushMsg(e.message))}>
            <Row><T kind="body" color={c.accent}>Send a test notification</T></Row>
          </Pressable>
        )}
        {pushMsg && <Row><T kind="footnote" color={c.ink2}>{pushMsg}</T></Row>}
      </Section>

      {p && (
        <Section title="Setup rules" aside="Applies from the next scan">
          <Row first style={{ gap: 8 }}>
            <T kind="body" style={{ flex: 1 }}>Fib levels</T>
            {[0.5, 0.618, 0.786].map((l) => <Chip key={l} label={String(l)} on={p.niveles.includes(l)} onPress={() => level(l)} />)}
          </Row>
          <Stepper label="RSI about to touch" value={p.rsi_cerca} step={1} min={20} max={50} onChange={(v) => setP({ ...p, rsi_cerca: v })} />
          <Stepper label="RSI lower band" value={p.rsi_banda} step={1} min={10} max={40} onChange={(v) => setP({ ...p, rsi_banda: v })} />
          <Stepper label="Bars to look back" hint="for the band touch" value={p.rsi_velas} step={1} min={1} max={20} onChange={(v) => setP({ ...p, rsi_velas: v })} />
          <Row>
            <T kind="body" style={{ flex: 1 }}>EWO counts when</T>
            <Segmented values={['Below zero', 'Falling']} index={p.ewo === 'negativo' ? 0 : 1} onChange={(i) => setP({ ...p, ewo: i === 0 ? 'negativo' : 'bajando' })} style={{ width: 190 }} />
          </Row>
          <Stepper label="Minimum gap size" hint="0 counts every gap" value={p.gap_min_pct} step={0.1} min={0} max={5} digits={1} onChange={(v) => setP({ ...p, gap_min_pct: v })} />
          <Stepper label="Default stop buffer" hint="% below the fib level" value={p.stop_buffer} step={0.1} min={0} max={3} digits={1} onChange={(v) => setP({ ...p, stop_buffer: v })} />
          <Row style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <Button label="Save rules" onPress={saveParams} />
            {saved && <T kind="footnote" color={c.ink2}>{saved}</T>}
          </Row>
        </Section>
      )}

      <T kind="footnote" color={c.ink3} style={{ textAlign: 'center', paddingHorizontal: 16 }}>
        Market data from Yahoo Finance, about 15 minutes delayed, for personal use. Scores and trade levels are screening tools, not investment advice.
      </T>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 20, paddingBottom: 40 },
  input: { flex: 1, minHeight: 44, borderRadius: radius.sm, paddingHorizontal: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.sm },
  stepBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
});
