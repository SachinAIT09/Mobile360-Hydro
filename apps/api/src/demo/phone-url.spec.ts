import { describe, expect, it } from 'vitest';
import { originFrom } from './phone-url.js';

describe('originFrom', () => {
  it('fixes Catalyst AppSail headers: http + host:443 is really https without a port', () => {
    expect(originFrom({ host: 'hydroonedemo-1.development.catalystappsail.in:443' }, 'http')).toBe('https://hydroonedemo-1.development.catalystappsail.in');
    expect(originFrom({ 'x-forwarded-proto': 'http', 'x-forwarded-host': 'demo.example.in:443' }, 'http')).toBe('https://demo.example.in');
  });
  it('honours standard proxy headers', () => {
    expect(originFrom({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'demo.example.com', host: '10.0.0.5:3000' }, 'http')).toBe('https://demo.example.com');
    expect(originFrom({ 'x-forwarded-proto': 'https,http', host: 'demo.example.com' }, 'http')).toBe('https://demo.example.com');
    expect(originFrom({ 'x-forwarded-ssl': 'on', host: 'demo.example.com' }, 'http')).toBe('https://demo.example.com');
    expect(originFrom({ 'x-forwarded-port': '443', host: 'demo.example.com' }, 'http')).toBe('https://demo.example.com');
  });
  it('keeps real ports and drops default ones', () => {
    expect(originFrom({ host: 'localhost:3000' }, 'http')).toBe('http://localhost:3000');
    expect(originFrom({ host: '192.168.1.20:3000' }, 'http')).toBe('http://192.168.1.20:3000');
    expect(originFrom({ host: 'demo.example.com:80' }, 'http')).toBe('http://demo.example.com');
    expect(originFrom({ 'x-forwarded-proto': 'https', host: 'demo.example.com:8443' }, 'http')).toBe('https://demo.example.com:8443');
  });
  it('uses PUBLIC_URL when set', () => {
    expect(originFrom({ host: 'internal:9000' }, 'http', 'https://ev-demo.powerconnect.ai/some/path')).toBe('https://ev-demo.powerconnect.ai');
    expect(originFrom({ host: 'localhost:3000' }, 'http', 'not a url')).toBe('http://localhost:3000');
  });
});
