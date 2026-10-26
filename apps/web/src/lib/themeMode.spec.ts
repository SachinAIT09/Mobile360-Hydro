import { describe, expect, it } from 'vitest';
import { resolveTheme } from './themeMode';

describe('resolveTheme', () => {
  it('uses an explicit choice whatever the OS prefers', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('follows the OS when set to system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });
});
