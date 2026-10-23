/**
 * Design tokens.
 *
 * Layout and component language follow the Hillsborough County Figma references
 * (web customer portal + mobile app); the palette is PowerConnect.AI's until the
 * utility's brand assets arrive (see brand.ts). Colour names are kept stable so
 * every screen can read `colors.primary` etc.
 */
export const colors = {
  // PowerConnect.AI brand
  navy: '#082148',
  navyDeep: '#051633',
  navyMid: '#0F3570',
  primary: '#6049E1',
  primaryDark: '#4A36C4',
  primaryTint: '#EEEBFC',
  primarySelectedBg: '#F6F4FE',
  accent: '#09B5FF',
  accentDark: '#009CFF',
  accentTint: '#E5F7FF',
  purple: '#8B30C8',
  // neutrals
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceTint: '#F7F9FD',
  inputTint: '#EEF4FF',
  text: '#0F1B2D',
  textBody: '#2B3645',
  textMuted: '#5B6B80',
  border: '#E6EAF2',
  borderInput: '#D5DCE8',
  divider: '#EEF1F6',
  subtle: '#E3E8EE',
  headerMuted: '#B8C7E0',
  logoDash: '#8FA6C4',
  // semantic
  solar: '#F2B33D',
  onSolar: '#2B1A00',
  solarTint: '#FFF6E3',
  solarText: '#5C3B00',
  ev: '#6049E1',
  evDeep: '#2A1F66',
  evTint: '#EEEBFC',
  evTintSoft: '#F6F4FE',
  evBorder: '#D3CBF5',
  evText: '#3B2E8F',
  evHeaderText: '#E4DFFA',
  knownText: '#9A5B00',
  unenrolledText: '#4A3BB0',
  grid: '#5B6B80',
  gridLine: '#8A96A6',
  successText: '#1E6B3A',
  successBg: '#E3F4E9',
  success: '#22A06B',
  warningText: '#8A4B00',
  warningBg: '#FFF1D6',
  alertHeader: '#7A3E00',
  alertHeaderText: '#FFD9A8',
  dangerText: '#8A1C1C',
  dangerBg: '#FDE8E8',
  danger: '#E5484D',
  outageText: '#B45309',
  splitPending: '#C3CCD8',
} as const;

/** Two-stop gradients (start → end) used for primary buttons, active nav and hero headers. */
export const gradients = {
  primary: ['#6049E1', '#8B30C8'],
  accent: ['#09B5FF', '#6049E1'],
  hero: ['#082148', '#0F3570'],
} as const;

export const radii = { card: 20, cardSm: 16, button: 999, buttonSm: 999, pill: 999, input: 14 } as const;

export const fonts = {
  body: 'Plus Jakarta Sans',
  mono: 'IBM Plex Mono',
} as const;

export const shadows = {
  card: '0 6px 24px rgba(8, 33, 72, 0.06)',
  cardHover: '0 10px 30px rgba(8, 33, 72, 0.10)',
  button: '0 8px 20px rgba(96, 73, 225, 0.30)',
} as const;

export type ColorToken = keyof typeof colors;
