import { useSyncExternalStore } from 'react';

/**
 * Light / dark theme for the staff app. The choice is stored per browser ('system' follows the OS).
 * The resolved theme is written to <html data-theme>, which styles.css keys its light tokens on.
 * index.html applies the stored choice before first paint so there is no flash of the wrong theme.
 */
export type ThemePref = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'pc-theme';
/** Dark is the default: it is the PowerConnect dashboard look the demo was designed in. */
const DEFAULT_PREF: ThemePref = 'dark';

const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch {
    // storage blocked (private mode): fall back to the default
  }
  return DEFAULT_PREF;
}

export function resolveTheme(pref: ThemePref, systemLight: boolean): Theme {
  if (pref === 'system') return systemLight ? 'light' : 'dark';
  return pref;
}

let pref = readPref();
let theme = resolveTheme(pref, !!media?.matches);

function apply() {
  theme = resolveTheme(pref, !!media?.matches);
  document.documentElement.dataset.theme = theme;
  listeners.forEach((l) => l());
}

media?.addEventListener('change', () => {
  if (pref === 'system') apply();
});

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // not persisted; still applies for this page view
  }
  apply();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Current preference and resolved theme; re-renders when either changes. */
export function useTheme(): { pref: ThemePref; theme: Theme } {
  const p = useSyncExternalStore(subscribe, () => pref);
  const t = useSyncExternalStore(subscribe, () => theme);
  return { pref: p, theme: t };
}
