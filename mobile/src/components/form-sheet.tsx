// Small modal form (open / edit / sell a position, price alert): labelled fields, live preview, server errors inline.
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { nums, radius, type, useColors } from '@/lib/theme';

import { T } from './ui';

export type FormField = { key: string; label: string; hint?: string; suffix?: string; kind?: 'number' | 'text' | 'date' };
export type FormValues = Record<string, string>;

export const num = (s: string | undefined) => (s == null || s.trim() === '' ? NaN : Number(s.replace(',', '.')));
export const today = () => new Date().toISOString().slice(0, 10);

export function FormSheet({ visible, ...rest }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  fields: FormField[];
  initial: FormValues;
  action: string;
  destructive?: boolean;
  /** Error to show instead of enabling the action, or null when the values are valid. */
  validate?: (v: FormValues) => string | null;
  preview?: (v: FormValues) => ReactNode;
  onSubmit: (v: FormValues) => Promise<unknown> | void;
  onClose: () => void;
}) {
  // mounted only while open, so the fields start from `initial` every time
  return visible ? <Body {...rest} /> : null;
}

function Body({ title, subtitle, fields, initial, action, destructive, validate, preview, onSubmit, onClose }: Omit<Parameters<typeof FormSheet>[0], 'visible'>) {
  const c = useColors();
  const [values, setValues] = useState<FormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const error = validate?.(values) ?? null;
  const submit = async () => {
    if (error || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (e) {
      setFailed((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.scrim} onPress={onClose}>
          <Pressable onPress={() => undefined} style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
              <View style={{ gap: 2 }}>
                <T kind="headline">{title}</T>
                {subtitle ? <T kind="footnote" color={c.ink2}>{subtitle}</T> : null}
              </View>
              <View style={{ gap: 8 }}>
                {fields.map((f, i) => (
                  <View key={f.key} style={styles.field}>
                    <View style={{ flex: 1 }}>
                      <T kind="subhead">{f.label}</T>
                      {f.hint ? <T kind="caption" color={c.ink2}>{f.hint}</T> : null}
                    </View>
                    <View style={[styles.input, f.kind === 'text' && styles.wide, { backgroundColor: c.surfaceRaised }]}>
                      <TextInput
                        value={values[f.key] ?? ''}
                        onChangeText={(v) => setValues((old) => ({ ...old, [f.key]: v }))}
                        keyboardType={!f.kind || f.kind === 'number' ? 'decimal-pad' : f.kind === 'date' ? 'numbers-and-punctuation' : 'default'}
                        placeholder={f.kind === 'date' ? 'YYYY-MM-DD' : f.kind === 'text' ? 'Optional' : undefined}
                        placeholderTextColor={c.ink3}
                        autoFocus={i === 0}
                        selectTextOnFocus
                        maxLength={f.kind === 'text' ? 200 : 16}
                        accessibilityLabel={f.label}
                        style={[type.callout, nums, styles.inputText, { color: c.ink, textAlign: f.kind === 'text' ? 'left' : 'right' }]}
                      />
                      {f.suffix ? <T kind="subhead" color={c.ink2}>{f.suffix}</T> : null}
                    </View>
                  </View>
                ))}
              </View>
              {!error && preview ? preview(values) : null}
              {(error || failed) && <T kind="footnote" color={c.down}>{failed ?? error}</T>}
              <View style={styles.actions}>
                <Pressable onPress={onClose} accessibilityRole="button" style={[styles.btn, { backgroundColor: c.surfaceRaised }]}>
                  <T kind="subhead" style={{ fontWeight: '600' }}>Cancel</T>
                </Pressable>
                <Pressable
                  onPress={submit}
                  disabled={!!error || busy}
                  accessibilityRole="button"
                  style={[styles.btn, { backgroundColor: destructive ? c.down : c.accent, opacity: error || busy ? 0.5 : 1 }]}>
                  <T kind="subhead" color={destructive ? '#fff' : c.accentInk} style={{ fontWeight: '600' }}>{action}</T>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.sm, paddingHorizontal: 10, minHeight: 40, width: 150 },
  wide: { width: 200 },
  inputText: { flex: 1, paddingVertical: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { height: 38, paddingHorizontal: 18, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
