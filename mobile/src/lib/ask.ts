// Tiny text prompt / confirm that works on iOS (Alert.prompt), Android and web.
import { Alert, Platform } from 'react-native';

export function ask(title: string, initial: string, onDone: (value: string) => void) {
  if (Platform.OS === 'web') {
    const v = typeof window !== 'undefined' ? window.prompt(title, initial) : null;
    if (v && v.trim()) onDone(v.trim());
  } else if (Platform.OS === 'ios') {
    Alert.prompt(title, undefined, (v) => v?.trim() && onDone(v.trim()), 'plain-text', initial);
  } else {
    Alert.alert(title, 'Renaming and creating lists by prompt is only available on iOS and web.');
  }
}

export function confirm(title: string, body: string, action: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n${body}`)) onYes();
  } else {
    Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: 'destructive', onPress: onYes }]);
  }
}
