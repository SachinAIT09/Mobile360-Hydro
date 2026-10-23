import { describe, expect, it } from 'vitest';
import { resolvePort } from './config.js';

describe('resolvePort', () => {
  it('prefers the Catalyst AppSail port, then API_PORT, then PORT', () => {
    expect(resolvePort({ X_ZOHO_CATALYST_LISTEN_PORT: '9000', API_PORT: '3100', PORT: '8080' })).toBe(9000);
    expect(resolvePort({ API_PORT: '3100', PORT: '8080' })).toBe(3100);
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
  });
  it('falls back to 3000 and skips invalid values', () => {
    expect(resolvePort({})).toBe(3000);
    expect(resolvePort({ X_ZOHO_CATALYST_LISTEN_PORT: '', PORT: 'abc' })).toBe(3000);
    expect(resolvePort({ X_ZOHO_CATALYST_LISTEN_PORT: '70000', API_PORT: '3100' })).toBe(3100);
  });
});
