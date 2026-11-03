import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { radius, useColors } from '@/lib/theme';

import { NamePrompt } from './name-prompt';
import { Icon, T } from './ui';

/** "Add to list" sheet: tick the lists a ticker belongs to, or create a new one with it. */
export function ListSheet({ ticker, visible, onClose }: { ticker: string; visible: boolean; onClose: () => void }) {
  const c = useColors();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const lists = useQuery({ queryKey: ['lists'], queryFn: api.lists, enabled: visible });
  const refresh = () => qc.invalidateQueries({ queryKey: ['lists'] });
  const toggle = useMutation({
    mutationFn: (v: { id: number; on: boolean }) => api.setListTicker(v.id, ticker, v.on),
    onMutate: () => { Haptics.selectionAsync().catch(() => undefined); },
    onSettled: refresh,
  });
  const create = useMutation({
    mutationFn: async (name: string) => { const l = await api.createList(name); await api.setListTicker(l.id, ticker, true); },
    onSettled: refresh,
  });
  const all = lists.data ?? [];

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.scrim} onPress={onClose}>
          <Pressable onPress={() => undefined} style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={styles.head}>
              <T kind="headline" style={{ flex: 1 }}>Add {ticker} to a list</T>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <Icon sf="xmark" web="close" size={18} color={c.ink2} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {all.map((l) => {
                const on = l.tickers.includes(ticker);
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => toggle.mutate({ id: l.id, on: !on })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceRaised : 'transparent', borderBottomColor: c.hairline }]}>
                    <Icon sf={on ? 'checkmark.square.fill' : 'square'} web={on ? 'check_box' : 'check_box_outline_blank'} size={22} color={on ? c.accent : c.ink3} />
                    <T kind="body" style={{ flex: 1 }}>{l.name}</T>
                    <T kind="footnote" tabular color={c.ink2}>{l.tickers.length}</T>
                  </Pressable>
                );
              })}
              {!all.length && !lists.isLoading && <T kind="footnote" color={c.ink2} style={{ paddingVertical: 12 }}>No lists yet — create the first one.</T>}
            </ScrollView>
            <Pressable onPress={() => setCreating(true)} accessibilityRole="button" style={[styles.newBtn, { backgroundColor: c.accentSoft }]}>
              <Icon sf="plus" web="add" size={18} color={c.accent} />
              <T kind="subhead" color={c.accent} style={{ fontWeight: '600' }}>New list with {ticker}</T>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <NamePrompt visible={creating} title="New list" action="Create" onSubmit={(n) => create.mutate(n)} onClose={() => setCreating(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10 },
});
