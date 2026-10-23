import { colors, gradients } from '@demo/shared';

export { colors, gradients };

/** Font family names registered by useFonts in the root layout (Plus Jakarta Sans, IBM Plex Mono for numbers/IDs). */
export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  mono: 'IBMPlexMono_500Medium',
} as const;

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

/** Soft card shadow used on white cards over the grey page background. */
export const shadowCard = {
  shadowColor: '#082148',
  shadowOpacity: 0.07,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

/** Stronger shadow for floating elements (sheets, the tab-bar action button, primary buttons). */
export const shadowFloat = {
  shadowColor: '#082148',
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
} as const;

/** react-native-web's Switch reads activeThumbColor (not in RN's types); keeps the thumb white on web. */
export const webSwitchProps = { activeThumbColor: '#FFFFFF' } as object;

/** Gradient props shared by primary buttons and hero headers. */
export const gradientProps = {
  primary: { colors: [...gradients.primary] as [string, string], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  accent: { colors: [...gradients.accent] as [string, string], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  hero: { colors: [...gradients.hero] as [string, string], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
} as const;
