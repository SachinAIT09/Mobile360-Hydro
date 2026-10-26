/**
 * Concrete colour values for canvas/SVG libraries (Leaflet paths, Recharts series) that can't read
 * CSS custom properties. Every value mirrors a token in styles.css :root; change both together.
 */
export const PALETTE = {
  /** --color-orange: EVs enrolled in the program ("known"). */
  known: '#fbbf24',
  /** --chart-lavender: EVs detected, not enrolled. */
  unenrolled: '#8b80d9',
  /** --toggle-switch-off: split not in sample. */
  unknown: '#717070',
  /** --link: feeder routes on the dark map. */
  route: '#60a5fa',
  /** --color-blue: the selected feeder. */
  selected: '#2563eb',
  /** --popover-background: casing under lines and marker outlines, so they sit into the dark map. */
  casing: '#0c1c47',
  /** Light theme --popover-background: casing on the light map. */
  casingLight: '#ffffff',
  /** --color-green / --color-orange / --color-red: forecast load bands. */
  ok: '#4ade80',
  warn: '#fbbf24',
  danger: '#f87171',
  /** --chart-deep-blue → --chart-lavender: blind-spot share, low to high. */
  gapLow: [0x16, 0x77, 0xc2] as const,
  gapHigh: [0x8b, 0x80, 0xd9] as const,
  /** --chart-total / --chart-positive / --chart-negative: line charts. */
  total: '#8b5cf6',
  positive: '#22c55e',
  negative: '#ef4444',
  /** --font-color and --border-color for chart axes and gridlines. */
  axis: '#e2e8f0',
  grid: 'rgba(255,255,255,0.09)',
} as const;
