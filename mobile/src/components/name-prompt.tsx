import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radius, useColors } from '@/lib/theme';

import { T } from './ui';

/** In-app text prompt (replaces the browser's window.prompt). */
export function NamePrompt({ visible, ...rest }: {
  visible: boolean; title: string; initial?: string; action?: string; onSubmit: (value: string) => void; onClose: () => void;
}) {
  // mounted only while open, so the field starts from `initial` every time
  return visible ? <PromptBody {...rest} /> : null;
}

function PromptBody({ title, initial = '', action = 'Save', onSubmit, onClose }: {
  title: string; initial?: string; action?: string; onSubmit: (value: string) => void; onClose: () => void;
}) {
  const c = useColors();
  const [value, setValue] = useState(initial);
  const ok = value.trim().length > 0;
  const submit = () => { if (ok) { onSubmit(value.trim()); onClose(); } };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable onPress={() => undefined} style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <T kind="headline">{title}</T>
          <TextInput
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            autoFocus
            maxLength={60}
            placeholder="List name"
            placeholderTextColor={c.ink3}
            returnKeyType="done"
            style={[styles.input, { backgroundColor: c.surfaceRaised, color: c.ink }]}
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} accessibilityRole="button" style={[styles.btn, { backgroundColor: c.surfaceRaised }]}>
              <T kind="subhead" style={{ fontWeight: '600' }}>Cancel</T>
            </Pressable>
            <Pressable onPress={submit} disabled={!ok} accessibilityRole="button" style={[styles.btn, { backgroundColor: c.accent, opacity: ok ? 1 : 0.5 }]}>
              <T kind="subhead" color={c.accentInk} style={{ fontWeight: '600' }}>{action}</T>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 14 },
  input: { height: 44, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { height: 38, paddingHorizontal: 18, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
