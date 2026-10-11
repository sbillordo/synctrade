// Tokens from DESIGN.md (dark is the primary appearance; light mirrors it).
import { Platform, useColorScheme } from 'react-native';

const dark = {
  ground: '#0B0E11',
  surface: '#12161B',
  surfaceRaised: '#191E25',
  surfaceHigh: '#212833',
  hairline: '#222932',
  hairlineStrong: '#2E3640',
  ink: '#E8EAED',
  ink2: '#A0A8B2',
  ink3: '#7D8691',
  up: '#22C98A',
  upSoft: 'rgba(34,201,138,0.14)',
  down: '#F25C66',
  downSoft: 'rgba(242,92,102,0.14)',
  accent: '#7AA2FF',
  accentInk: '#07112A',
  accentSoft: 'rgba(122,162,255,0.14)',
  warn: '#F2B84B',
};

const light: typeof dark = {
  ground: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F2F5',
  surfaceHigh: '#E6E9EE',
  hairline: '#E3E6EB',
  hairlineStrong: '#D3D8DF',
  ink: '#0F1318',
  ink2: '#4F5865',
  ink3: '#69727E',
  up: '#0B9466',
  upSoft: 'rgba(11,148,102,0.10)',
  down: '#D63445',
  downSoft: 'rgba(214,52,69,0.09)',
  accent: '#2A55E5',
  accentInk: '#FFFFFF',
  accentSoft: 'rgba(42,85,229,0.10)',
  warn: '#B7791F',
};

export type Colors = typeof dark;

export function useColors(): Colors & { scheme: 'dark' | 'light' } {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  return { ...(scheme === 'light' ? light : dark), scheme };
}

// iOS text styles (Dynamic Type scales them through allowFontScaling); SF Pro on iOS, system stack elsewhere.
export const font = Platform.select({ ios: undefined, default: 'Inter, system-ui, -apple-system, sans-serif' });
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.37 },
  title2: { fontSize: 22, fontWeight: '700' as const },
  title3: { fontSize: 20, fontWeight: '600' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17, fontWeight: '400' as const },
  callout: { fontSize: 16, fontWeight: '400' as const },
  subhead: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
};
export const nums = { fontVariant: ['tabular-nums' as const] };
export const radius = { tag: 6, sm: 8, md: 12, card: 14, lg: 18 };
