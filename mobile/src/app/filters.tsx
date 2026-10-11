// Filters sheet: minimum, each condition (count / require / ignore), timeframes, sort.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, Row, Section, Segmented, T } from '@/components/ui';
import { api, CONDS, getServerUrl, TIMEFRAMES } from '@/lib/api';
import { DEFAULT_FILTERS, HELP, LABEL, passes, SORTS, type Filters, type Rule, type SortKey } from '@/lib/conditions';
import { useAppState } from '@/lib/store';
import { useColors } from '@/lib/theme';

const MINS = [0, 5, 4, 3];
const RULES: Rule[] = ['count', 'require', 'ignore'];

export default function FiltersSheet() {
  const c = useColors();
  const { filters, setFilters, universe } = useAppState();
  const [draft, setDraft] = useState<Filters>(filters);
  const results = useQuery({ queryKey: ['results', universe], queryFn: () => api.results(universe), enabled: !!getServerUrl() });
  const all = results.data?.results ?? [];
  const pool = all.filter((s) => draft.tfs.includes(s.tf));
  const count = all.filter((s) => passes(s, draft)).length;
  const sortKeys = Object.keys(SORTS) as SortKey[];

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable hitSlop={10} onPress={() => setDraft(DEFAULT_FILTERS)} accessibilityRole="button">
              <T kind="body" color={c.accent}>Reset</T>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.page}>
        <Section title="Minimum conditions met">
          <Row first>
            <Segmented
              values={MINS.map((m) => (m === 0 ? 'All' : m === 5 ? '5 of 5' : `${m}+`))}
              index={Math.max(0, MINS.indexOf(draft.min))}
              onChange={(i) => setDraft({ ...draft, min: MINS[i] })}
              style={{ flex: 1 }}
            />
          </Row>
        </Section>

        <Section title="Each condition" aside="Count · Require · Ignore">
          {CONDS.map((k, i) => {
            const met = pool.filter((s) => s[`c_${k}`]).length;
            return (
              <Row key={k} first={i === 0} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <View style={styles.condHead}>
                  <View style={{ flex: 1 }}>
                    <T kind="headline">{LABEL[k]}</T>
                    <T kind="footnote" color={c.ink2}>{HELP[k]}</T>
                  </View>
                  <T kind="footnote" tabular color={c.ink2}>{met} of {pool.length} results</T>
                </View>
                <Segmented
                  values={['Count', 'Require', 'Ignore']}
                  index={RULES.indexOf(draft.rule[k])}
                  onChange={(j) => setDraft({ ...draft, rule: { ...draft.rule, [k]: RULES[j] } })}
                />
              </Row>
            );
          })}
        </Section>
        <T kind="footnote" color={c.ink2} style={{ marginTop: -8, paddingHorizontal: 4 }}>
          Require: must be met. Ignore: left out, so the minimum applies to the rest. Counts are over every scanned result in the chosen timeframes.
        </T>

        <Section title="Timeframes">
          <Row first style={{ gap: 8 }}>
            {TIMEFRAMES.map((t) => (
              <Chip
                key={t}
                label={t}
                on={draft.tfs.includes(t)}
                onPress={() => {
                  const has = draft.tfs.includes(t);
                  if (has && draft.tfs.length === 1) return;
                  setDraft({ ...draft, tfs: has ? draft.tfs.filter((x) => x !== t) : [...draft.tfs, t] });
                }}
              />
            ))}
          </Row>
        </Section>

        <Section title="Sort by">
          <Row first>
            <Segmented values={sortKeys.map((k) => SORTS[k].label)} index={sortKeys.indexOf(draft.sort)} onChange={(i) => setDraft({ ...draft, sort: sortKeys[i] })} style={{ flex: 1 }} />
          </Row>
        </Section>

        <Button label={`Show ${count} setup${count === 1 ? '' : 's'}`} onPress={() => { setFilters(draft); router.back(); }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 20, paddingBottom: 40 },
  condHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
