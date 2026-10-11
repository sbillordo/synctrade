// Native action sheet on iOS; on web a simple cycle through the options.
import { ActionSheetIOS, Platform } from 'react-native';

export function pick(title: string, options: string[], current: number, onPick: (i: number) => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options, 'Cancel'], cancelButtonIndex: options.length },
      (i) => i < options.length && onPick(i),
    );
  } else {
    onPick((current + 1) % options.length);
  }
}
