import { describe, expect, it } from 'vitest';
import { gateKind, startingPage } from './gate.js';

const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

describe('gateKind', () => {
  it('passes everything once ready', () => {
    expect(gateKind(true, 'GET', '/', HTML)).toBe('pass');
    expect(gateKind(true, 'POST', '/api/auth/login', 'application/json')).toBe('pass');
  });
  it('serves the starting page to browsers while booting', () => {
    expect(gateKind(false, 'GET', '/', HTML)).toBe('html');
    expect(gateKind(false, 'GET', '/staff/feeders', HTML)).toBe('html');
    expect(gateKind(false, 'GET', '/app/login', HTML)).toBe('html');
  });
  it('answers JSON to API, socket and asset calls while booting', () => {
    expect(gateKind(false, 'GET', '/api/demo/state', HTML)).toBe('json');
    expect(gateKind(false, 'POST', '/api/auth/login', 'application/json')).toBe('json');
    expect(gateKind(false, 'GET', '/socket.io/', '*/*')).toBe('json');
    expect(gateKind(false, 'GET', '/staff/assets/index.js', '*/*')).toBe('json');
    expect(gateKind(false, 'POST', '/', HTML)).toBe('json');
  });
});

describe('startingPage', () => {
  it('refreshes itself while starting', () => {
    const html = startingPage();
    expect(html).toContain('Starting the demo');
    expect(html).toContain('http-equiv="refresh"');
  });
  it('shows an escaped error and stops refreshing when start-up failed', () => {
    const html = startingPage('Mongo <failed>');
    expect(html).toContain('Mongo &lt;failed&gt;');
    expect(html).not.toContain('http-equiv="refresh"');
  });
});
