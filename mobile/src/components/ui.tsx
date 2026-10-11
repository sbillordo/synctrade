// Shared building blocks: SF Symbol icons, text, chips, grouped sections, empty states.
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

import { font, nums, radius, type, useColors } from '@/lib/theme';

type SymbolName = SymbolViewProps['name'];

export function Icon({ sf, web, size = 20, color }: { sf: string; web: string; size?: number; color: string }) {
  return <SymbolView name={{ ios: sf, web } as SymbolName} size={size} tintColor={color} />;
}

export function T({ style, kind = 'body', color, tabular, ...props }: TextProps & {
  kind?: keyof typeof type; color?: string; tabular?: boolean; style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  return (
    <Text
      {...props}
      style={[type[kind], { color: color ?? c.ink, fontFamily: font }, tabular && nums, style]}
    />
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: on ? 'transparent' : c.hairlineStrong, backgroundColor: on ? c.accentSoft : 'transparent', opacity: pressed ? 0.7 : 1 },
      ]}>
      <T kind="subhead" color={on ? c.accent : c.ink2} style={{ fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Segmented({ values, index, onChange, style }: {
  values: string[]; index: number; onChange: (i: number) => void; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <SegmentedControl
      values={values}
      selectedIndex={index}
      onChange={(e) => onChange(e.nativeEvent.selectedSegmentIndex)}
      appearance={c.scheme}
      style={StyleSheet.flatten([{ minHeight: 32 }, style])}
    />
  );
}

export function Section({ title, aside, children, style }: { title?: string; aside?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ gap: 8 }, style]}>
      {(title || aside) && (
        <View style={styles.sectionHead}>
          {title ? <T kind="headline">{title}</T> : <View />}
          {typeof aside === 'string' ? <T kind="footnote" color={c.ink2}>{aside}</T> : aside}
        </View>
      )}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.hairline }]}>{children}</View>
    </View>
  );
}

export function Row({ children, first, style }: { children: ReactNode; first?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairlineStrong }, style]}>{children}</View>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <T kind="headline" style={{ textAlign: 'center' }}>{title}</T>
      <T kind="subhead" color={c.ink2} style={{ textAlign: 'center' }}>{body}</T>
      {action}
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, disabled }: {
  label: string; onPress: () => void; kind?: 'primary' | 'plain'; icon?: ReactNode; disabled?: boolean;
}) {
  const c = useColors();
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? c.accent : c.surfaceRaised, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      <T kind="headline" color={primary ? c.accentInk : c.ink}>{label}</T>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  group: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 48 },
  button: { minHeight: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
});
