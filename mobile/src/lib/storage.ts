// Small per-device preferences (server URL, filters, amount). Same localStorage API on iOS and web.
import 'expo-sqlite/localStorage/install';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(`synctrade.${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(`synctrade.${key}`, JSON.stringify(value));
  } catch {
    // storage full or unavailable: preferences are a convenience, never required
  }
}
