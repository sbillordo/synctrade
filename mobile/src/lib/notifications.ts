// Push notifications: the server scans and sends through Expo Push; the app only registers its token.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';
import { load, save } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const pushEnabled = () => load<boolean>('pushEnabled', false);

/** Asks for permission, gets the Expo push token and registers it on the server. Returns an error message or null. */
export async function enablePush(): Promise<string | null> {
  if (Platform.OS === 'web') return 'Notifications work in the iPhone app, not on the web.';
  if (!Device.isDevice) return 'Push notifications need a real iPhone, not the simulator.';
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'Notifications are off for SyncTrade. Turn them on in iOS Settings.';
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) return 'Missing EAS project id. Run "eas init" once and rebuild the app.';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.pushRegister(token, Platform.OS);
  save('pushToken', token);
  save('pushEnabled', true);
  return null;
}

export async function disablePush() {
  const token = load<string | null>('pushToken', null);
  if (token) await api.pushUnregister(token).catch(() => undefined);
  save('pushEnabled', false);
}

export type SetupsPayload = { type: 'setups'; items: { ticker: string; tf: string }[] } | { type: 'test' };
