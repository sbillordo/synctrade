import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { useNames } from '@/lib/names';
import { radius, useColors } from '@/lib/theme';

import { Icon, T } from './ui';

/** Ticker box with live suggestions from the symbols the server knows. Enter adds what is typed. */
export function TickerSearch({ existing, names: known = {}, onAdd }: { existing: string[]; names?: Record<string, string>; onAdd: (symbol: string) => void }) {
  const c = useColors();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);
  const found = useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.length > 0, staleTime: 60_000 });
  const typed = text.trim().toUpperCase();
  const suggestions = typed ? (found.data ?? []).slice(0, 6) : [];
  const add = (s: string) => { onAdd(s.toUpperCase()); setText(''); setQ(''); };
  const names = { ...known, ...useNames(suggestions) };
  const exact = suggestions.includes(typed);

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.box, { backgroundColor: c.surfaceRaised }]}>
        <Icon sf="magnifyingglass" web="search" size={18} color={c.ink3} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => typed && add(typed)}
          placeholder="Search a ticker to add…"
          placeholderTextColor={c.ink3}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Search ticker to add"
          style={[styles.input, { color: c.ink }]}
        />
        {text ? (
          <Pressable onPress={() => setText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear">
            <Icon sf="xmark.circle.fill" web="cancel" size={18} color={c.ink3} />
          </Pressable>
        ) : null}
      </View>
      {typed ? (
        <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          {suggestions.map((s) => {
            const has = existing.includes(s);
            return (
              <Pressable
                key={s}
                disabled={has}
                onPress={() => add(s)}
                accessibilityRole="button"
                accessibilityLabel={has ? `${s} already in list` : `Add ${s}`}
                style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.surfaceRaised : 'transparent', borderBottomColor: c.hairline }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T kind="headline" style={{ fontSize: 15 }}>{s}</T>
                  {names[s] ? <T kind="caption" color={c.ink3} numberOfLines={1}>{names[s]}</T> : null}
                </View>
                {has ? <T kind="footnote" color={c.ink3}>In list</T> : <Icon sf="plus.circle" web="add_circle" size={20} color={c.accent} />}
              </Pressable>
            );
          })}
          {!exact && !existing.includes(typed) && (
            <Pressable onPress={() => add(typed)} accessibilityRole="button" style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.surfaceRaised : 'transparent', borderBottomWidth: 0 }]}>
              <T kind="subhead" color={c.ink2} style={{ flex: 1 }}>Add “{typed}” anyway</T>
              <Icon sf="plus.circle" web="add_circle" size={20} color={c.accent} />
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 21, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, height: 42, outlineStyle: 'none' } as never,
  menu: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
