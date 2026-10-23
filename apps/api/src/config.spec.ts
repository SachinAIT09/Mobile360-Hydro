import { describe, expect, it } from 'vitest';
import { resolvePort, socketPollingOnly } from './config.js';

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

describe('socketPollingOnly', () => {
  it('is on for Catalyst AppSail and off elsewhere by default', () => {
    expect(socketPollingOnly({ X_ZOHO_CATALYST_LISTEN_PORT: '9000' })).toBe(true);
    expect(socketPollingOnly({})).toBe(false);
  });
  it('can be forced either way', () => {
    expect(socketPollingOnly({ SOCKET_POLLING_ONLY: 'true' })).toBe(true);
    expect(socketPollingOnly({ SOCKET_POLLING_ONLY: 'false', X_ZOHO_CATALYST_LISTEN_PORT: '9000' })).toBe(false);
  });
});
